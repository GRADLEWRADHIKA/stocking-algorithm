'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Bot } from 'lucide-react';
import { useAssistant } from '@/hooks/queries';
import { Page, PageHeader } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/assistant/Markdown';
import { Logo } from '@/components/layout/Logo';
import type { AssistantResponse } from '@shared/types/api';

interface Turn {
  id: number;
  q: string;
  a?: AssistantResponse;
  error?: string;
}

const STARTERS = [
  'Why is RELIANCE showing a bullish trend?',
  'What does RSI indicate for TCS right now?',
  'Explain the MACD crossover on INFY',
  'Compare HDFCBANK and ICICIBANK',
  'Explain the latest BUY signal for SBIN',
  'What are the risks of the breakout strategy?',
  'What happened during my last backtest?',
  'Explain maximum drawdown',
  'What is the current market regime?',
  'Summarize the technical indicators for ITC',
];

const STAGES = ['Reading the question', 'Finding symbols and timeframe', 'Loading local prices and indicators', 'Applying the rules'];

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STAGES.length - 1)), 260);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="flex gap-1">
        {[0, 1, 2].map((k) => (
          <motion.span key={k} className="h-1.5 w-1.5 rounded-full bg-accent" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 0.9, repeat: Infinity, delay: k * 0.15 }} />
        ))}
      </span>
      <AnimatePresence mode="wait">
        <motion.span key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
          {STAGES[i]}…
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function Answer({ a, onAsk }: { a: AssistantResponse; onAsk: (q: string) => void }) {
  const block = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };
  return (
    <motion.div initial="hidden" animate="show" transition={{ staggerChildren: 0.08 }} className="space-y-4">
      <motion.div variants={block} className="flex flex-wrap items-center gap-1.5">
        <Badge tone="info">{a.intent.replace(/_/g, ' ')}</Badge>
        {a.entities.symbols.map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
        {a.entities.timeframe && <Badge>{a.entities.timeframe}</Badge>}
        {a.entities.indicator && <Badge>{a.entities.indicator}</Badge>}
      </motion.div>
      <motion.div variants={block}>
        <Markdown text={a.answer} />
      </motion.div>
      {(a.observations.length > 0 || a.interpretations.length > 0) && (
        <motion.div variants={block} className="grid gap-3 md:grid-cols-2">
          {a.observations.length > 0 && (
            <div className="rounded-card border border-line p-3">
              <div className="mb-2 text-xs font-medium">Observed in the data</div>
              <ul className="space-y-1.5 text-[13px]">
                {a.observations.map((o) => (
                  <li key={o} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 flex-none rounded-full bg-ink" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.interpretations.length > 0 && (
            <div className="rounded-card border border-line p-3">
              <div className="mb-2 text-xs font-medium">How it is usually interpreted</div>
              <ul className="space-y-1.5 text-[13px] text-ink/85">
                {a.interpretations.map((o) => (
                  <li key={o} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 flex-none rounded-full bg-faint" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
      {a.data.length > 0 && (
        <motion.dl variants={block} className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {a.data.map((d) => (
            <div key={d.label} className="flex justify-between gap-3 border-t border-rule py-1.5 text-xs">
              <dt className="text-muted">{d.label}</dt>
              <dd className="num text-right">{d.value}</dd>
            </div>
          ))}
        </motion.dl>
      )}
      {a.disclaimers.length > 0 && (
        <motion.div variants={block} className="space-y-1">
          {a.disclaimers.map((d) => (
            <p key={d} className="text-[11px] text-faint">
              {d}
            </p>
          ))}
        </motion.div>
      )}
      {a.suggestions.length > 0 && (
        <motion.div variants={block} className="flex flex-wrap gap-2">
          {a.suggestions.map((s) => (
            <button key={s} onClick={() => onAsk(s)} className="rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-faint hover:text-ink">
              {s}
            </button>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

function Chat() {
  const params = useSearchParams();
  const symbol = params.get('symbol') ?? undefined;
  const ask = useAssistant();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    const id = Date.now();
    setTurns((t) => [...t, { id, q: question }]);
    setInput('');
    ask.mutate(
      { question, context: symbol ? { symbol } : undefined },
      {
        onSuccess: (a) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, a } : x))),
        onError: (e) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: e.message } : x))),
      },
    );
  };

  useEffect(() => {
    const q = params.get('q');
    if (q && !started.current) {
      started.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  return (
    <Page className="flex min-h-[calc(100vh-88px)] max-w-[1000px] flex-col">
      <PageHeader
        title="AI assistant"
        sub={
          <>
            <span>Answers are computed from local prices, indicators, signals and your backtests. No internet, no external model.</span>
            <Badge tone="info">rule-based-v1</Badge>
            {symbol && <Badge>Context: {symbol}</Badge>}
          </>
        }
      />
      <div className="flex-1 space-y-6 pb-6">
        {turns.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel p-6">
            <div className="flex items-center gap-3">
              <Logo size={28} />
              <div>
                <p className="text-[15px] font-semibold">Ask about a stock, an indicator, a signal or a backtest</p>
                <p className="text-xs text-muted">It names the data it used and separates what it observed from how that is usually read.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s, i) => (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.03 }}
                  onClick={() => send(s)}
                  className="rounded-ctl border border-line px-3 py-2.5 text-left text-[13px] text-muted transition-[border-color,color,transform] hover:-translate-y-px hover:border-faint hover:text-ink"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="ml-auto w-fit max-w-[80%] rounded-card bg-raised px-4 py-2.5 text-[13px]">
              {t.q}
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface ring-1 ring-line">
                <Bot className="h-3.5 w-3.5 text-accent" />
              </div>
              <div className="min-w-0 flex-1 pt-1">
                {t.a ? <Answer a={t.a} onAsk={send} /> : t.error ? <p className="text-[13px] text-down">{t.error}</p> : <Thinking />}
              </div>
            </motion.div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-4 flex items-end gap-2 rounded-card border border-line bg-surface p-2 shadow-2xl"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="e.g. Compare TCS and INFY on momentum"
          aria-label="Ask the assistant"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[13px] text-ink placeholder:text-faint focus:outline-none"
        />
        <Button type="submit" size="icon" variant="primary" disabled={!input.trim()} loading={ask.isPending} aria-label="Send">
          {!ask.isPending && <ArrowUp className="h-4 w-4" />}
        </Button>
      </form>
    </Page>
  );
}

export default function AssistantPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}
