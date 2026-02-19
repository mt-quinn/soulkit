import { useEffect, useRef } from 'react';
import { useConsoleStreamStore } from '@/stores/consoleStreamStore';
import { Terminal, X, Eraser } from 'lucide-react';

export function ConsolePopup() {
  const { isOpen, activeRuns, buffer, open, close, clear } = useConsoleStreamStore();
  const preRef = useRef<HTMLPreElement | null>(null);
  const stickToBottomRef = useRef(true);

  const visible = isOpen || activeRuns > 0;
  const canHide = activeRuns === 0;

  const updateStickState = () => {
    const element = preRef.current;
    if (!element) return;
    const threshold = 24;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
    stickToBottomRef.current = nearBottom;
  };

  useEffect(() => {
    if (!visible) return;
    stickToBottomRef.current = true;
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (!preRef.current) return;
    if (!stickToBottomRef.current) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [buffer, visible]);

  if (!visible) {
    return (
      <div className="pointer-events-none fixed bottom-24 right-4 z-40">
        <button
          onClick={open}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-md border border-emerald-500/60 bg-black/95 px-3 py-2 text-xs font-medium text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.25)] cursor-pointer"
        >
          <Terminal className="h-3.5 w-3.5" />
          Console
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-40 w-[min(760px,calc(100vw-1.5rem))]">
      <div className="pointer-events-auto overflow-hidden rounded-md border border-emerald-500/60 bg-black/95 shadow-[0_0_24px_rgba(16,185,129,0.28)]">
        <div className="flex items-center justify-between border-b border-emerald-500/40 px-3 py-2">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] text-emerald-300">
            <Terminal className="h-3.5 w-3.5" />
            SYSTEM CONSOLE
            <span className={activeRuns > 0 ? 'text-emerald-300 animate-pulse' : 'text-emerald-500/70'}>
              {activeRuns > 0 ? `RUNNING (${activeRuns})` : 'IDLE'}
            </span>
          </div>
          <div className="inline-flex items-center gap-1">
            <button
              onClick={clear}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 cursor-pointer"
              title="Clear console"
            >
              <Eraser className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={close}
              disabled={!canHide}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 cursor-pointer"
              title={canHide ? 'Hide console' : 'Console is pinned while a run is active'}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <pre
          ref={preRef}
          onScroll={updateStickState}
          className="h-72 overflow-y-auto px-3 py-2 text-xs leading-relaxed text-emerald-300/95 font-mono whitespace-pre-wrap"
        >
          {buffer || '[console ready] waiting for tokens...'}
        </pre>
      </div>
    </div>
  );
}
