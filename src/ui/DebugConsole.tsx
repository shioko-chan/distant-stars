import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatEmpireDate } from './EmpireClock';
import type { useSimulation } from './useSimulation';

const help = 'help — 查看命令\nreplay — 校验本局确定性回放（暂停时间）\nstatus — 记录当前模拟状态\nclear — 清空控制台日志';

export function DebugConsole({ session }: { session: ReturnType<typeof useSimulation> }) {
    const [open, setOpen] = useState(false);
    const [command, setCommand] = useState('');
    const dialog = useRef<HTMLDialogElement>(null), output = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const { view, fatal, speed, metrics, replay, replayPending, debugLog, logDebug, clearDebugLog } = session;
    const state = fatal ? '模拟异常' : replayPending ? '回放校验中' : !view ? '连接中' : speed === 0 ? '已暂停' : '推进中';

    useEffect(() => {
        if (open) { dialog.current?.showModal(); input.current?.focus(); }
        else dialog.current?.close();
    }, [open]);
    useEffect(() => {
        const toggle = (event: KeyboardEvent) => {
            if (event.code !== 'Backquote' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
            event.preventDefault();
            setOpen(value => !value);
        };
        window.addEventListener('keydown', toggle);
        return () => window.removeEventListener('keydown', toggle);
    }, []);
    useEffect(() => {
        if (open && output.current) output.current.scrollTop = output.current.scrollHeight;
    }, [open, debugLog]);

    const run = (text: string) => {
        const name = text.trim().toLowerCase();
        if (!name) return;
        if (name === 'clear') { clearDebugLog(); return; }
        logDebug(`> ${text.trim()}`);
        if (name === 'help') logDebug(help);
        else if (name === 'status') logDebug(`${state} · 帝国日期 ${view ? formatEmpireDate(view.time) : '待连接'} · 种子 ${view?.seed ?? '—'} · 最近模拟响应 ${metrics.toFixed(1)} ms`);
        else if (name === 'replay') {
            if (!view || fatal) logDebug('模拟尚未就绪，请先读取有效存档或开始新纪元。', 'error');
            else if (replayPending) logDebug('回放校验正在进行，请等待结果。');
            else replay();
        }
        else logDebug(`未知命令：${text.trim()}。输入 help 查看可用命令。`, 'error');
    };

    return <>
        <button className="debug-launcher" aria-haspopup="dialog" aria-expanded={open} aria-controls="debug-console" onClick={() => setOpen(true)}>调试控制台</button>
        {createPortal(<dialog id="debug-console" className="debug-console" ref={dialog} aria-labelledby="debug-console-title" aria-describedby="debug-console-description" onClose={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
            <header className="debug-console-heading"><div><small>DEBUG MODE</small><h2 id="debug-console-title">调试控制台</h2></div><button aria-label="关闭调试控制台" onClick={() => setOpen(false)}>关闭 · Esc</button></header>
            <p id="debug-console-description">诊断整局模拟。回放校验会暂停时间，从开局重算并比对当前状态；不会覆盖进度。</p>
            <dl className="debug-readouts">
                <div><dt>模拟状态</dt><dd>{state}</dd></div>
                <div><dt>帝国日期</dt><dd>{view ? formatEmpireDate(view.time) : '—'}</dd></div>
                <div><dt>随机种子</dt><dd>{view?.seed ?? '—'}</dd></div>
                <div><dt>最近模拟响应</dt><dd>{metrics.toFixed(1)} ms</dd></div>
            </dl>
            <div className="debug-actions"><button disabled={!view || fatal || replayPending} onClick={() => run('replay')}>{replayPending ? '正在校验…' : '校验本局确定性回放'}</button><button onClick={() => run('status')}>记录状态</button><button onClick={() => run('help')}>命令帮助</button><button onClick={clearDebugLog}>清空日志</button></div>
            <div ref={output} className="debug-output" role="log" aria-label="调试日志" aria-live="polite" aria-relevant="additions" tabIndex={0}>
                {debugLog.length === 0 ? <p>暂无日志。输入 help 查看命令，或使用上方快捷操作。</p> : debugLog.map(entry => <div className={`debug-entry ${entry.level}`} key={entry.id}><time dateTime={new Date(entry.time).toISOString()}>{new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{entry.message}</span></div>)}
            </div>
            <form className="debug-command" onSubmit={event => { event.preventDefault(); run(command); setCommand(''); input.current?.focus(); }}>
                <label htmlFor="debug-command">命令</label><input ref={input} id="debug-command" value={command} maxLength={200} autoComplete="off" spellCheck={false} placeholder="help / replay / status / clear" onChange={event => setCommand(event.target.value)}/><button type="submit" disabled={!command.trim()}>执行</button>
            </form>
            <small className="debug-hint">保留最近 200 条日志 · 输入框外按反引号键（`）切换 · 移除地址中的 debug=1 并刷新可退出调试模式</small>
        </dialog>, document.body)}
    </>;
}
