import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engine = path.resolve(process.env.UNREAL_ENGINE ?? path.join(root, '.unreal-engine'));
const project = path.join(root, 'unreal/DistantStars.uproject');
const operation = process.argv[2];

if (process.platform !== 'linux') {
    throw new Error('This launcher is for Linux. Open unreal/DistantStars.uproject in Unreal 5.8 on other platforms.');
}
if (operation !== 'play' && !fs.existsSync(path.join(engine, 'Engine/Build/Build.version'))) {
    throw new Error('Set UNREAL_ENGINE to your Unreal Engine 5.8 installation.');
}

const env = { ...process.env };
const nix = fs.existsSync('/etc/NIXOS');
if (nix) {
    const libraries = fs.readdirSync('/nix/store')
        .filter(name => /-nss-\d|-nspr-\d/.test(name))
        .map(name => path.join('/nix/store', name, 'lib'))
        .filter(dir => fs.existsSync(path.join(dir, 'libnss3.so')) || fs.existsSync(path.join(dir, 'libnspr4.so')));
    env.LD_LIBRARY_PATH = [...libraries, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

function run(command, args = []) {
    const result = spawnSync(nix ? 'steam-run' : command, nix ? [command, ...args] : args, {
        cwd: root, env, stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

const editor = path.join(engine, 'Engine/Binaries/Linux/UnrealEditor');
const windowArgs = ['-windowed', '-ResX=1440', '-ResY=900', '-nosplash', '-nop4', ...process.argv.slice(3)];
switch (operation) {
    case 'build':
        run('/bin/bash', [
            path.join(engine, 'Engine/Build/BatchFiles/Linux/Build.sh'),
            'DistantStarsEditor', 'Linux', 'Development', project,
            '-NoHotReload', '-MaxParallelActions=4', '-NoUBA'
        ]);
        break;
    case 'prepare':
    case 'import-cat':
        run(editor + '-Cmd', [
            project, '-run=pythonscript',
            `-script=${path.join(root, 'scripts/unreal', operation === 'prepare' ? 'prepare-assets.py' : 'import-cat.py')}`,
            '-nullrhi', '-unattended', '-nosplash', '-nop4', '-nosound'
        ]);
        break;
    case 'test':
        run(editor + '-Cmd', [
            project, '-RenderOffscreen', '-unattended', '-nosplash', '-nop4', '-nosound',
            '-ExecCmds=Automation RunTests DistantStars.Native; SoftQuit',
            `-ReportExportPath=${path.join(root, 'unreal/Saved/NativeTests')}`
        ]);
        break;
    case 'run':
        if (!fs.existsSync(path.join(root, 'unreal/Content/Web/index.html'))) {
            throw new Error('Run npm run build before starting Unreal.');
        }
        run(editor, [project, '-game', ...windowArgs]);
        break;
    case 'play': {
        const launcher = path.join(root, 'unreal/Packaged/Linux/DistantStars.sh');
        if (!fs.existsSync(launcher)) throw new Error('Run npm run unreal:package first.');
        run('/bin/sh', [launcher, ...windowArgs]);
        break;
    }
    case 'package':
        run('/bin/bash', [
            path.join(engine, 'Engine/Build/BatchFiles/RunUAT.sh'), 'BuildCookRun', `-project=${project}`,
            '-noP4', '-platform=Linux', '-clientconfig=Development', '-build', '-cook', '-stage', '-pak', '-archive',
            `-archivedirectory=${path.join(root, 'unreal/Packaged')}`
        ]);
        break;
    default:
        throw new Error('Usage: tool.mjs build|prepare|import-cat|test|run|package|play');
}
