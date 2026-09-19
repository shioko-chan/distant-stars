import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const input = process.argv[2];
if (!input || !fs.statSync(input).isDirectory()) throw new Error('Usage: npm run music:render -- /absolute/path/to/extracted-256-samples');
const output = path.join(root, 'public/audio');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'distant-stars-music-'));
const rate = 48000;
function load(relative) {
    const source = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    new Function('exports', 'require', 'module', source)(module.exports,
        name => load(path.relative(root, path.resolve(root, path.dirname(relative), name)) + '.ts'), module);
    return module.exports;
}
function ffmpeg(args) {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}`)));
    });
}
const { MUSIC_TRACKS } = load('src/content/music.ts');
const trackId = process.argv[3];
const tracks = trackId ? MUSIC_TRACKS.filter(track => track.id === trackId) : MUSIC_TRACKS;
if (!tracks.length) throw new Error(`Unknown track: ${trackId}`);
// Partial renders must preserve provenance and measurements for untouched audio.
const manifestPath = path.join(output, 'render-manifest.json');
const previous = trackId ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
const { renderTheme, RECORDED_INSTRUMENTS, RECORDED_STRUCK_INSTRUMENTS } = load('src/presentation/themeMusic.ts');
// The harp uses scientific pitch naming (C3 = MIDI 48); the other selected
// recordings use C3 = MIDI 60. Confirmed against their recorded fundamentals.
const families = {
    marimba: { prefix: 'Marimba_hit_Outrigger_', octave: 2, level: .38 },
    pizzicato: { prefix: 'CelloEns_pizzT_', octave: 2, level: .36 },
    harp: { prefix: 'KSHarp_', octave: 1, level: .34 },
    bell: { prefix: 'Vibes_soft_', octave: 2, level: .3 },
    cello: { prefix: 'CelloEns_susvib_', octave: 2, level: .4 },
    strings: { prefix: 'VlnEns_susVib_', octave: 2, level: .34 },
    horn: { prefix: 'SGHorn_sus_', octave: 2, level: .38 },
    flute: { prefix: 'LDFlute_susvib_', octave: 2, level: .38 },
};
const pitchClasses = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const files = fs.readdirSync(input).sort();
const bank = new Map(), sources = new Map(), mappings = [];
fs.mkdirSync(output, { recursive: true });
try {
    for (const track of tracks) {
        for (const note of track.notes) {
            if (!RECORDED_INSTRUMENTS.has(note.instrument)) continue;
            const key = `${note.instrument}:${note.midi}`;
            if (bank.has(key)) continue;
            const family = families[note.instrument];
            const candidates = files.filter(file => file.startsWith(family.prefix)).map(file => {
                const [, letter, sharp, octave] = file.match(/_([A-G])(#?)(\d)_/);
                return { file, midi: 12 * (Number(octave) + family.octave) + pitchClasses[letter] + (sharp ? 1 : 0) };
            }).sort((a, b) => Math.abs(a.midi - note.midi) - Math.abs(b.midi - note.midi));
            if (!candidates.length) throw new Error(`Missing sample family ${family.prefix}`);
            const chosen = candidates[0];
            const speed = 2 ** ((note.midi - chosen.midi) / 12);
            const pcm = path.join(temporary, 'note.f32');
            // Rate conversion transposes both pitch and duration; FFmpeg filters aliasing.
            await ffmpeg(['-i', path.join(input, chosen.file), '-af',
                `asetrate=${Math.round(44100 * speed)},aresample=${rate},highpass=f=35`,
                '-ac', '2', '-f', 'f32le', pcm]);
            const bytes = fs.readFileSync(pcm);
            const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
            const left = new Float32Array(samples.length / 2), right = new Float32Array(left.length);
            let peak = 0;
            for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
            const gain = Math.min(12, family.level / Math.max(peak, .0001));
            for (let i = 0; i < left.length; i++) { left[i] = samples[i * 2] * gain; right[i] = samples[i * 2 + 1] * gain; }
            bank.set(key, { left, right });
            sources.set(chosen.file, createHash('sha256').update(fs.readFileSync(path.join(input, chosen.file))).digest('hex'));
            mappings.push({ instrument: note.instrument, midi: note.midi, sample: chosen.file, rootMidi: chosen.midi });
        }
    }
    for (const track of tracks) for (const note of track.notes) {
        if (!RECORDED_INSTRUMENTS.has(note.instrument) || RECORDED_STRUCK_INSTRUMENTS.has(note.instrument)) continue;
        if (bank.get(`${note.instrument}:${note.midi}`).left.length < Math.round(note.duration * rate)) {
            throw new Error(`Sustain recording too short: ${track.id} ${note.instrument}:${note.midi}`);
        }
    }
    const report = [];
    for (const track of tracks) {
        const { left, right } = renderTheme(track, rate, bank);
        const pcm = Buffer.alloc(left.length * 8);
        let peak = 0, energy = 0;
        for (let i = 0; i < left.length; i++) {
            if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error(`Invalid audio: ${track.id}`);
            peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
            energy += left[i] ** 2 + right[i] ** 2;
            pcm.writeFloatLE(left[i], i * 8); pcm.writeFloatLE(right[i], i * 8 + 4);
        }
        if (peak > .651 || peak < .01) throw new Error(`Unexpected peak: ${track.id}: ${peak}`);
        const raw = path.join(temporary, 'mix.f32'); fs.writeFileSync(raw, pcm);
        await ffmpeg(['-f', 'f32le', '-ar', String(rate), '-ac', '2', '-i', raw,
            '-c:a', 'libmp3lame', '-b:a', '192k', '-metadata', `title=${track.title}`,
            path.join(output, `${track.id}.mp3`)]);
        report.push({ id: track.id, duration: track.duration, peak, rms: Math.sqrt(energy / (left.length * 2)) });
        console.log(`Rendered ${track.title} (${track.duration}s)`);
    }
    fs.writeFileSync(manifestPath, JSON.stringify({
        sampleRate: rate, source: 'https://s3.amazonaws.com/VersilianStudios/256OrchestralSamples.rar',
        samples: { ...previous?.samples, ...Object.fromEntries(sources) },
        mappings: previous ? [...new Map([...previous.mappings, ...mappings]
            .map(mapping => [`${mapping.instrument}:${mapping.midi}`, mapping])).values()] : mappings,
        tracks: previous ? [...previous.tracks.filter(track => !report.some(item => item.id === track.id)), ...report]
            .sort((a, b) => MUSIC_TRACKS.findIndex(track => track.id === a.id) - MUSIC_TRACKS.findIndex(track => track.id === b.id)) : report,
    }, null, 2) + '\n');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
