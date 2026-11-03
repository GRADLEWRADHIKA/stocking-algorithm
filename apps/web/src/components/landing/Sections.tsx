'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowUpRight, Bell, Bot, BriefcaseBusiness, House, LineChart, Star, UserRound } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { ActionBadge } from '@/components/ui/badge';
import { ConditionList } from '@/components/analysis/SignalCard';
import { Sparkline } from '@/components/charts/Sparkline';
import { pct, price, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import { IndicesFragment } from './Fragments';
import { useIndices, useLandingAnalysis, useLatestSignals, useMovers, useStatus } from './data';
import type { Signal } from '@shared/types/api';

const rise = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } } as const;

/* ------------------------------------------------------------------ how it works: run-in column */
export function HowItWorks({ signal }: { signal: Signal | undefined }) {
  const a = useLandingAnalysis(signal?.symbol ?? 'INFY').data;
  const chips = a
    ? [
        ['RSI 14', a.momentum.rsi?.toFixed(1)],
        ['ADX 14', a.trend.adx?.toFixed(1)],
        ['ATR % of price', a.volatility.atr_pct === null ? null : `${a.volatility.atr_pct.toFixed(2)}%`],
        ['Volume vs 20-day', `${a.volume.ratio.toFixed(2)}×`],
      ]
    : [];
  const hp = signal?.historical_performance;
  const stages: { lead: string; body: string; evidence: React.ReactNode }[] = [
    {
      lead: 'To begin,',
      body: 'prices come from a deterministic market simulator or from CSV files you import. Every file is checked for gaps, duplicates and impossible bars, and every price on screen carries a label saying where it came from.',
      evidence: <IndicesFragment limit={2} />,
    },
    {
      lead: 'Next,',
      body: 'eleven indicators are computed with standard definitions and strictly in time order: the value on a bar never sees the bars that came after it.',
      evidence: (
        <div data-ui className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-4">
          {chips.map(([k, v]) => (
            <div key={k} className="border-r border-rule px-4 py-3 last:border-r-0">
              <div className="text-xs text-muted">{k}</div>
              <div className="num mt-1 text-[15px]">{v ?? '—'}</div>
            </div>
          ))}
          {!a && <div className="skeleton col-span-4 m-3 h-12" />}
        </div>
      ),
    },
    {
      lead: 'Then,',
      body: 'nine strategies test their rules on the latest bar. A signal is only BUY or SELL when its required conditions hold, and it writes down each one, met or not.',
      evidence: signal ? (
        <div data-ui className="rounded-card border border-line bg-surface p-4">
          <ConditionList conditions={signal.conditions.slice(0, 3)} />
        </div>
      ) : (
        <div className="skeleton h-28" />
      ),
    },
    {
      lead: 'Before any order,',
      body: 'the backtester replays history with brokerage, charges, slippage and next-bar fills, and keeps the last part of the period aside as an out-of-sample test.',
      evidence: (
        <div data-ui className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-sm">
          <span className="text-muted">{signal ? `${signal.strategy} on ${signal.symbol}` : 'Same rules, stored history'}</span>
          <span>
            Trades <span className="num">{hp?.trades ?? '—'}</span>
          </span>
          <span>
            Win rate <span className="num">{hp?.win_rate === null || hp?.win_rate === undefined ? '—' : pct(hp.win_rate, 0, false)}</span>
          </span>
          <span>
            Avg trade <span className={cn('num', toneClass(hp?.avg_return_pct))}>{pct(hp?.avg_return_pct)}</span>
          </span>
        </div>
      ),
    },
    {
      lead: 'Finally,',
      body: 'ideas meet the market in a paper account: market and limit orders, attached stop-loss and targets, positions and a full ledger, with virtual money only.',
      evidence: (
        <div data-ui className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
          <div className="grid flex-1 grid-cols-2 rounded-ctl bg-raised p-0.5 text-sm font-semibold">
            <span className="rounded-[5px] bg-up py-1.5 text-center text-white">Buy</span>
            <span className="py-1.5 text-center text-muted">Sell</span>
          </div>
          <Link href="/login?next=/paper-trading" className="rounded-ctl bg-ink px-4 py-2 text-sm font-medium text-ground transition-transform active:scale-95">
            Open paper account
          </Link>
        </div>
      ),
    },
  ];

  return (
    <section id="how" className="px-4 py-[72px] md:py-[110px]" aria-labelledby="how-title">
      <div className="mx-auto max-w-[620px]">
        <motion.h2 {...rise} id="how-title" className="mb-12 text-[28px] font-medium tracking-[-0.02em] md:text-[32px]">
          From a price to a decision
        </motion.h2>
        <div className="space-y-[72px]">
          {stages.map((s) => (
            <motion.div key={s.lead} {...rise}>
              <p className="text-[17px] leading-[1.6] text-muted md:text-lg">
                <strong className="font-semibold text-ink">{s.lead}</strong> {s.body}
              </p>
              <div className="mt-5">{s.evidence}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ mobile app: panel with margin notes */
const NOTES = [
  { id: 'indices', side: 'l', top: 70, name: 'Live indices', text: 'NIFTY 50, SENSEX, Bank, IT and Midcap tick every second from the simulator.' },
  { id: 'movers', side: 'l', top: 250, name: 'Movers', text: 'Top gainers update in place, prices washing green or red as they move.' },
  { id: 'signals', side: 'l', top: 430, name: 'Signals with reasons', text: 'Tap any signal to read every condition it checked and the levels it set.' },
  { id: 'alerts', side: 'r', top: 20, name: 'Alerts', text: 'Price, percentage, RSI and crossover alerts arrive as in-app notifications.' },
  { id: 'assistant', side: 'r', top: 400, name: 'Assistant', text: 'Ask why a stock is trending; answers are computed from local data only.' },
  { id: 'tabs', side: 'r', top: 570, name: 'Same desk', text: 'Home, markets, watchlist, portfolio and profile. Layouts saved on one device open on the other.' },
] as const;

function PhonePanel({ active }: { active: string | null }) {
  const idx = useIndices().data ?? [];
  const movers = useMovers().data?.items ?? [];
  const sigs = useLatestSignals().data ?? [];
  const ring = (id: string) => cn('rounded-ctl transition-[box-shadow,transform] duration-200', active === id && 'ring-1 ring-accent');
  return (
    <div data-ui className="relative mx-auto flex h-[700px] w-[380px] max-w-full flex-col overflow-hidden rounded-[32px] border border-line bg-ground">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <span className="flex items-center gap-2">
          <Logo size={20} />
          <span className="text-[15px] font-semibold">QuantDesk</span>
        </span>
        <span className={cn('relative p-1', ring('alerts'))}>
          <Bell className="h-4 w-4 text-muted" />
          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      </div>
      <div className="flex-1 space-y-4 overflow-hidden px-4">
        <div className={cn('flex gap-2 overflow-hidden p-0.5', ring('indices'))}>
          {idx.slice(0, 3).map((q) => (
            <div key={q.symbol} className="w-[140px] flex-none rounded-ctl border border-line bg-surface p-2.5">
              <div className="truncate text-[11px] text-muted">{q.name.replace(/\s*\(.*\)$/, '')}</div>
              <div className="num text-[13px]">{price(q.value)}</div>
              <div className="flex items-end justify-between">
                <span className={cn('num text-[11px]', toneClass(q.change_pct))}>{pct(q.change_pct)}</span>
                <Sparkline data={q.sparkline} width={52} height={18} />
              </div>
            </div>
          ))}
        </div>
        <div className={cn('rounded-card border border-line bg-surface', ring('movers'))}>
          <div className="px-3 pt-2.5 text-[13px] font-semibold">Top gainers</div>
          {movers.slice(0, 4).map((m) => (
            <div key={m.symbol} className="flex items-center justify-between border-t border-rule px-3 py-2 text-[13px] first:border-t-0">
              <span className="font-medium">{m.symbol}</span>
              <span className="num">{price(m.price)}</span>
              <span className={cn('num w-14 text-right text-xs', toneClass(m.change_pct))}>{pct(m.change_pct)}</span>
            </div>
          ))}
        </div>
        <div className={cn('rounded-card border border-line bg-surface', ring('signals'))}>
          <div className="px-3 pt-2.5 text-[13px] font-semibold">Latest signals</div>
          {sigs.slice(0, 3).map((s) => (
            <div key={`${s.id}-${s.strategy_key}`} className="flex items-center gap-2 border-t border-rule px-3 py-2 text-[13px] first:border-t-0">
              <ActionBadge action={s.action} />
              <span className="font-medium">{s.symbol}</span>
              <span className="truncate text-xs text-muted">{s.strategy}</span>
            </div>
          ))}
        </div>
        <div className={cn('flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-[13px] text-muted', ring('assistant'))}>
          <Bot className="h-4 w-4 text-accent" /> Why is INFY trending up?
        </div>
      </div>
      <div className={cn('mx-2 mb-2 grid grid-cols-5 border-t border-line pt-2 text-[10px] text-muted', ring('tabs'))}>
        {[
          [House, 'Home'],
          [LineChart, 'Markets'],
          [Star, 'Watchlist'],
          [BriefcaseBusiness, 'Portfolio'],
          [UserRound, 'Profile'],
        ].map(([Icon, l], i) => {
          const I = Icon as typeof House;
          return (
            <span key={l as string} className={cn('relative flex flex-col items-center gap-1 pb-1', i === 0 && 'text-ink')}>
              {i === 0 && <span className="absolute -top-2 h-0.5 w-6 rounded bg-accent" />}
              <I className="h-4 w-4" />
              {l as string}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function MobileApp() {
  const [active, setActive] = useState<string | null>(null);
  const note = (n: (typeof NOTES)[number]) => (
    <button
      key={n.id}
      onMouseEnter={() => setActive(n.id)}
      onMouseLeave={() => setActive(null)}
      onFocus={() => setActive(n.id)}
      onBlur={() => setActive(null)}
      className={cn('block w-full max-w-[24ch] text-left transition-colors lg:absolute', n.side === 'l' ? 'lg:right-0 lg:text-right' : 'lg:left-0')}
      style={{ top: n.top }}
    >
      <span className={cn('block text-lg font-medium transition-colors', active === n.id ? 'text-accent' : 'text-ink')}>{n.name}</span>
      <span className="mt-1 block text-[15px] leading-snug text-muted">{n.text}</span>
    </button>
  );
  return (
    <section id="mobile" className="mx-auto max-w-[1280px] px-4 py-[120px] md:px-8 md:py-[200px]" aria-labelledby="mobile-title">
      <motion.h2 {...rise} id="mobile-title" className="mb-12 text-center text-[26px] font-medium tracking-[-0.02em] lg:text-[36px]">
        Same desk in your pocket
      </motion.h2>
      <div className="grid gap-10 lg:h-[700px] lg:grid-cols-[1fr_400px_1fr] lg:gap-12">
        <div className="relative hidden lg:block">{NOTES.filter((n) => n.side === 'l').map(note)}</div>
        <motion.div {...rise}>
          <PhonePanel active={active} />
        </motion.div>
        <div className="relative hidden lg:block">{NOTES.filter((n) => n.side === 'r').map(note)}</div>
        <div className="grid gap-y-8 sm:grid-cols-2 sm:gap-x-6 lg:hidden">{NOTES.map(note)}</div>
      </div>
      <p className="mt-10 text-center text-sm text-muted">Android and iOS, built with React Native. It talks to the same local server as the web terminal.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ proof: what it does not need, and what it is built on */
const STACK = ['Python', 'FastAPI', 'PostgreSQL', 'pandas', 'scikit-learn', 'Next.js', 'React Native'];
const NEEDS = [
  ['API keys', 'None. No data vendor, no LLM provider, no broker credentials.'],
  ['Internet', 'Not at runtime. Prices come from the local simulator or files you import.'],
  ['Real money', 'Never. Orders fill against simulated prices in virtual accounts.'],
];
export function Stack() {
  return (
    <section className="bg-surface px-4 py-[72px] md:px-8 md:py-[110px]" aria-labelledby="stack-title">
      <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
        <div>
          <motion.h2 {...rise} id="stack-title" className="text-[30px] font-medium leading-[1.1] tracking-[-0.03em] md:text-[42px]">
            Everything runs on your machine
          </motion.h2>
          <dl className="mt-10 space-y-6">
            {NEEDS.map(([k, v], i) => (
              <motion.div key={k} {...rise} transition={{ ...rise.transition, delay: i * 0.06 }} className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-6">
                <dt className="text-lg font-medium text-ink">{k}</dt>
                <dd className="text-lg text-muted">{v}</dd>
              </motion.div>
            ))}
          </dl>
        </div>
        <div className="lg:pt-2">
          <p className="text-lg text-ink">Built on open source</p>
          <ul className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5">
            {STACK.map((x, i) => (
              <motion.li key={x} {...rise} transition={{ ...rise.transition, delay: 0.1 + i * 0.05 }} className="text-[24px] font-medium tracking-[-0.015em] text-ink">
                {x}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ cta: a sentence with a blank */
export function Cta() {
  const router = useRouter();
  const [sym, setSym] = useState('');
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const s = (sym.trim() || 'RELIANCE').toUpperCase().replace(/[^A-Z0-9&-]/g, '');
    router.push(`/login?next=${encodeURIComponent(`/backtesting?symbol=${s}`)}`);
  };
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-[120px] md:px-8 md:py-[180px]" aria-labelledby="cta-title">
      <motion.form {...rise} onSubmit={go}>
        <h2 id="cta-title" className="text-[9vw] font-medium leading-[1.12] tracking-[-0.035em] md:text-[5.4vw]">
          Backtest <span className="hidden md:inline">your first idea on </span>
          <label className="sr-only" htmlFor="cta-symbol">
            Stock symbol
          </label>
          <input
            id="cta-symbol"
            value={sym}
            onChange={(e) => setSym(e.target.value)}
            placeholder="RELIANCE"
            maxLength={20}
            autoComplete="off"
            className="mx-[0.12em] inline-block h-[1.1em] w-[6.4em] rounded-ctl bg-raised px-[0.2em] align-baseline uppercase text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
          />{' '}
          <button type="submit" className="inline-block h-[1.1em] rounded-ctl bg-accent px-[0.25em] align-baseline text-ground transition-transform hover:brightness-110 active:scale-[0.97]">
            today
          </button>
        </h2>
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-base text-muted">You log in with the demo trader, the backtester opens on that stock, and every result is net of costs.</p>
          <a href="#demo" className="text-base text-ink hover:text-accent">
            Or try the engine first ↑
          </a>
        </div>
      </motion.form>
    </section>
  );
}

/* ------------------------------------------------------------------ footer of tiles */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="num">{now ? now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' }) : '—'}</span>;
}

export function Footer() {
  const status = useStatus().data;
  const tile = 'rounded-card bg-surface p-5 md:p-6';
  return (
    <footer className="grid grid-cols-2 gap-1.5 p-2 md:grid-cols-12 md:gap-2 md:p-3">
      <div className={cn(tile, 'order-5 col-span-2 flex min-h-[220px] flex-col justify-between md:order-none md:col-span-4')}>
        <p className="text-2xl leading-snug">A research desk for Indian equities that you run yourself.</p>
        <p className="mt-6 text-[13px] text-muted">Prices are simulated or imported, never live NSE/BSE quotes. Paper trading only. Nothing here is investment advice.</p>
      </div>
      <nav className={cn(tile, 'order-3 md:order-none md:col-span-3')} aria-label="Footer">
        <ul className="space-y-2 text-base">
          {[
            ['Live demo', '#demo'],
            ['How it works', '#how'],
            ['Mobile app', '#mobile'],
            ['Log in', '/login'],
            ['Create an account', '/register'],
          ].map(([l, h]) => (
            <li key={l}>
              <Link href={h} className="text-ink hover:text-accent">
                {l}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className={cn(tile, 'order-6 flex flex-col justify-between md:order-none md:col-span-2')}>
        <p className="text-base">Mumbai</p>
        <div>
          <p className="text-2xl">
            <Clock />
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
            <span className={cn('h-1.5 w-1.5 rounded-full', status?.session === 'OPEN' ? 'animate-pulse-dot bg-up' : 'bg-faint')} />
            {status ? (status.session === 'OPEN' ? 'Simulated session open' : 'Simulated session closed') : 'Server offline'}
          </p>
        </div>
      </div>
      <div className={cn(tile, 'order-4 flex flex-col justify-between md:order-none md:col-span-3')}>
        <p className="text-base text-muted">For developers</p>
        <a href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/docs`} className="text-xl text-ink hover:text-accent">
          API reference
        </a>
      </div>
      <div className="order-1 col-span-2 flex min-h-[160px] items-center justify-center overflow-hidden rounded-card bg-ink md:order-none md:col-span-8 md:min-h-[320px]">
        <span className="select-none text-[14vw] font-semibold leading-none tracking-[-0.05em] text-ground md:text-[9vw]">QuantDesk</span>
      </div>
      <Link href="/login" className="group order-2 col-span-2 flex min-h-[200px] flex-col justify-between rounded-card bg-accent p-6 text-ground md:order-none md:col-span-4 md:min-h-[320px]">
        <span className="text-[28px] font-medium leading-tight">Open the terminal</span>
        <ArrowUpRight className="h-14 w-14 self-end transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" strokeWidth={2.5} />
      </Link>
    </footer>
  );
}
