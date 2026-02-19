import { useEffect, useRef, useState } from 'react';
import { useLlmBarStore } from '@/stores/llmBarStore';
import { Sparkles, Loader2 } from 'lucide-react';

export function UniversalCommandBar() {
  const { prompt, setPrompt, config } = useLlmBarStore();
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = submitting || config.busy;

  useEffect(() => {
    if (config.disabled || busy) return;
    inputRef.current?.focus();
  }, [config.disabled, busy, config.placeholder, config.submitLabel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const typingTarget = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (typingTarget) return;
      event.preventDefault();
      inputRef.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSubmit = async () => {
    if (busy) return;
    const text = prompt.trim();
    if (!text || !config.onSubmit || config.disabled) return;

    setSubmitting(true);
    try {
      await Promise.resolve(config.onSubmit(text));
      setPrompt('');
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-4">
      <div className="pointer-events-auto mx-auto max-w-5xl rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur">
        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {config.chips.map((chip) => (
              <span key={chip.id} className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                {chip.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 p-3">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <input
            ref={inputRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={config.placeholder}
            disabled={config.disabled || busy}
            className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={config.disabled || busy || !prompt.trim()}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60 cursor-pointer"
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Working
              </span>
            ) : (
              config.submitLabel
            )}
          </button>
        </div>
        {config.disabledReason && (
          <p className="px-4 pb-3 text-[11px] text-muted-foreground">
            {config.disabledReason}
          </p>
        )}
      </div>
    </div>
  );
}
