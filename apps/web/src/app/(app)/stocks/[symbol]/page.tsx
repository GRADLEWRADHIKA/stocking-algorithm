'use client';
import Link from 'next/link';
import { Suspense, use, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, FlaskConical, ShoppingCart } from 'lucide-react';
import { useAnalysis, useAssistant, useCandles, useStock } from '@/hooks/queries';
import { useLive } from '@/stores/live';
import { Page, Panel, Stagger } from '@/components/ui/panel';
import { Tabs } from '@/components/ui/tabs';
import { Badge, SourceBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FlashPrice } from '@/components/ui/numbers';
import { EmptyState, ErrorState, SkeletonRows, Skeleton } from '@/components/ui/states';
import { ChartWorkspace } from '@/components/analysis/ChartWorkspace';
import { SignalCard } from '@/components/analysis/SignalCard';
import { StrengthMeter } from '@/components/market/MarketBlocks';
import { OrderTicket } from '@/components/trading/OrderTicket';
import { WatchButton } from '@/components/trading/WatchButton';
import { Markdown } from '@/components/assistant/Markdown';
import { LineChart } from '@/components/charts/LineChart';
import { compact, pct, price, signed, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { StockAnalysis, StockDetail, Timeframe } from '@shared/types/api';

type Tab = 'overview' | 'chart' | 'technical' | 'fundamentals' | 'performance' | 'ai' | 'signals';

function KV({ k, v, cls }: { k: string; v: React.ReactNode; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-rule py-2 text-[13px] first:border-t-0">
      <span className="text-muted">{k}</span>
      <span className={cn('num text-right', cls)}>{v}</span>
    </div>
  );
}

function Header({ s, onTrade }: { s: StockDetail; onTrade: () => void }) {
  const live = useLive((st) => st.ticks[s.symbol]);
  const p = live?.price ?? s.price;
  const ch = live?.change ?? s.change;
  const cp = live?.change_pct ?? s.change_pct;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{s.symbol}</h1>
          <Badge>{s.exchange}</Badge>
          <Badge>{s.sector}</Badge>
          <SourceBadge source={s.data_source} />
        </div>
        <p className="mt-0.5 text-[13px] text-muted">{s.name}</p>
        <div className="mt-3 flex items-baseline gap-3">
          <FlashPrice value={p} dir={live?.dir} className="text-[32px] font-medium leading-none tracking-tight" />
          <span className={cn('num text-[15px]', toneClass(cp))}>
            {signed(ch)} ({pct(cp)})
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <WatchButton symbol={s.symbol} />
        <Button size="sm" asChild>
          <Link href={`/backtesting?symbol=${s.symbol}`}>
            <FlaskConical className="h-3.5 w-3.5" /> Backtest
          </Link>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/assistant?symbol=${s.symbol}`}>
            <Bot className="h-3.5 w-3.5" /> Ask assistant
          </Link>
        </Button>
        <Button size="sm" variant="primary" onClick={onTrade}>
          <ShoppingCart className="h-3.5 w-3.5" /> Paper trade
        </Button>
      </div>
    </div>
  );
}

function TrendSummary({ a }: { a: StockAnalysis }) {
  const dirTone = a.trend.direction === 'UPTREND' ? 'up' : a.trend.direction === 'DOWNTREND' ? 'down' : 'neutral';
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        <Badge tone={dirTone}>{a.trend.direction.toLowerCase()}</Badge>
        <Badge>{a.trend.strength.toLowerCase()} trend</Badge>
        <Badge tone={a.volatility.state === 'HIGH' ? 'warn' : 'neutral'}>{a.volatility.state.toLowerCase()} volatility</Badge>
        <Badge tone="info">{a.regime.label.replace(/_/g, ' ').toLowerCase()}</Badge>
      </div>
      <p className="text-[13px] leading-relaxed">{a.regime.description}</p>
      <div>
        <KV k="RSI 14" v={a.momentum.rsi?.toFixed(1) ?? '—'} />
        <KV k="ADX 14" v={a.trend.adx?.toFixed(1) ?? '—'} />
        <KV k="MACD histogram" v={a.momentum.macd_histogram?.toFixed(2) ?? '—'} cls={toneClass(a.momentum.macd_histogram)} />
        <KV k="ATR as % of price" v={pct(a.volatility.atr_pct, 2, false)} />
        <KV k="Volume vs 20-day avg" v={`${a.volume.ratio.toFixed(2)}×`} />
        <KV k="Nearest support" v={price(a.levels.supports[0])} />
        <KV k="Nearest resistance" v={price(a.levels.resistances[0])} />
      </div>
    </div>
  );
}

function TechnicalTab({ a }: { a: StockAnalysis }) {
  const blocks: { title: string; rows: [string, React.ReactNode, string?][]; note: string }[] = [
    {
      title: 'Trend',
      note: `${a.trend.direction.toLowerCase()}, ${a.trend.strength.toLowerCase()}`,
      rows: [
        ['EMA 20', price(a.trend.ema_20)],
        ['EMA 50', price(a.trend.ema_50)],
        ['SMA 200', price(a.trend.sma_200)],
        ['ADX 14', a.trend.adx?.toFixed(1) ?? '—'],
        ['EMA 20 slope, 5 bars', pct(a.trend.slope_20_pct), toneClass(a.trend.slope_20_pct)],
      ],
    },
    {
      title: 'Momentum',
      note: a.momentum.state,
      rows: [
        ['RSI 14', a.momentum.rsi?.toFixed(1) ?? '—'],
        ['ROC 10', pct(a.momentum.roc_10), toneClass(a.momentum.roc_10)],
        ['MACD', a.momentum.macd?.toFixed(2) ?? '—'],
        ['MACD signal', a.momentum.macd_signal?.toFixed(2) ?? '—'],
        ['Stochastic %K / %D', `${a.momentum.stoch_k?.toFixed(1) ?? '—'} / ${a.momentum.stoch_d?.toFixed(1) ?? '—'}`],
      ],
    },
    {
      title: 'Volatility',
      note: `${a.volatility.state.toLowerCase()}`,
      rows: [
        ['ATR 14', price(a.volatility.atr)],
        ['ATR % of price', pct(a.volatility.atr_pct, 2, false)],
        ['Historical vol, 20 bars (ann.)', pct(a.volatility.hist_vol_20, 1, false)],
        ['Bollinger width', pct(a.volatility.bb_width_pct, 2, false)],
      ],
    },
    {
      title: 'Volume',
      note: `OBV ${a.volume.obv_trend.toLowerCase()}`,
      rows: [
        ['Latest volume', compact(a.volume.latest)],
        ['20-bar average', compact(a.volume.avg_20)],
        ['Ratio', `${a.volume.ratio.toFixed(2)}×`],
        ['OBV trend', a.volume.obv_trend.toLowerCase()],
      ],
    },
  ];
  return (
    <Stagger className="grid gap-4 lg:grid-cols-12">
      {blocks.map((b) => (
        <Panel key={b.title} className="lg:col-span-3" title={b.title} action={<span className="text-xs text-muted">{b.note}</span>} bodyClassName="px-4 py-1">
          {b.rows.map(([k, v, c]) => (
            <KV key={k} k={k} v={v} cls={c} />
          ))}
        </Panel>
      ))}
      <Panel className="lg:col-span-4" title="Support and resistance" bodyClassName="p-4">
        <div className="space-y-1">
          {[...a.levels.resistances].reverse().map((l) => (
            <div key={`r${l}`} className="flex items-center gap-3 text-[13px]">
              <span className="w-24 text-xs text-down">Resistance</span>
              <span className="num">{price(l)}</span>
              <span className="num ml-auto text-xs text-muted">{pct(((l - a.price) / a.price) * 100)}</span>
            </div>
          ))}
          <div className="my-2 flex items-center gap-3 border-y border-rule py-2 text-[13px]">
            <span className="w-24 text-xs text-ink">Analysed price</span>
            <span className="num font-medium">{price(a.price)}</span>
          </div>
          {a.levels.supports.map((l) => (
            <div key={`s${l}`} className="flex items-center gap-3 text-[13px]">
              <span className="w-24 text-xs text-up">Support</span>
              <span className="num">{price(l)}</span>
              <span className="num ml-auto text-xs text-muted">{pct(((l - a.price) / a.price) * 100)}</span>
            </div>
          ))}
          {a.levels.supports.length + a.levels.resistances.length === 0 && <p className="text-xs text-muted">No swing levels found in the lookback window.</p>}
        </div>
        <p className="mt-3 text-[11px] text-faint">Levels are clustered swing highs and lows from the analysed timeframe.</p>
      </Panel>
      <Panel className="lg:col-span-4" title="What the data shows" bodyClassName="p-4">
        <ul className="space-y-2 text-[13px]">
          {a.observations.map((o, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 h-1 w-1 flex-none rounded-full bg-ink" />
              {o}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="lg:col-span-4" title="How it is usually read" bodyClassName="p-4">
        <ul className="space-y-2 text-[13px] text-ink/85">
          {a.interpretations.map((o, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 h-1 w-1 flex-none rounded-full bg-faint" />
              {o}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-faint">Interpretations are educational and do not predict future prices.</p>
      </Panel>
    </Stagger>
  );
}

function PerformanceTab({ s }: { s: StockDetail }) {
  const candles = useCandles(s.symbol, '1d', 800);
  const periods = Object.entries(s.performance) as [string, number | null][];
  const max = Math.max(1, ...periods.map(([, v]) => Math.abs(v ?? 0)));
  const series = useMemo(
    () => [{ name: 'Close', color: 'rgb(var(--ink))', points: (candles.data?.candles ?? []).map((c) => ({ time: c.time, value: c.close })), fill: true }],
    [candles.data],
  );
  return (
    <Stagger className="grid gap-4 lg:grid-cols-12">
      <Panel className="lg:col-span-8" title="Daily close, full history" action={<SourceBadge source={candles.data?.data_source} />} bodyClassName="p-3">
        {candles.data ? <LineChart series={series} height={280} format={(v) => price(v, 0)} /> : <Skeleton className="h-[280px]" />}
      </Panel>
      <Panel className="lg:col-span-4" title="Returns by period" bodyClassName="p-4">
        <ul className="space-y-2.5">
          {periods.map(([k, v], i) => (
            <li key={k} className="grid grid-cols-[40px_1fr_70px] items-center gap-3 text-[13px]">
              <span className="text-muted">{k}</span>
              <span className="relative h-2">
                <span className="absolute left-1/2 top-0 h-full w-px bg-line" />
                {v !== null && (
                  <motion.span
                    className={cn('absolute top-0 h-2 rounded-sm', v >= 0 ? 'bg-up/80' : 'bg-down/80')}
                    style={v >= 0 ? { left: '50%' } : { right: '50%' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.abs(v) / max) * 50}%` }}
                    transition={{ delay: i * 0.05, duration: 0.7 }}
                  />
                )}
              </span>
              <span className={cn('num text-right', toneClass(v))}>{pct(v)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <KV k="52-week high" v={price(s.stats.high_52w)} />
          <KV k="52-week low" v={price(s.stats.low_52w)} />
          <KV k="Annualised volatility" v={pct(s.stats.volatility_annualized, 1, false)} />
          <KV k="Beta vs NIFTY 50" v={s.stats.beta?.toFixed(2) ?? '—'} />
        </div>
      </Panel>
    </Stagger>
  );
}

function AiTab({ symbol }: { symbol: string }) {
  const trend = useAssistant();
  const summary = useAssistant();
  const { mutate: askTrend } = trend;
  const { mutate: askSummary } = summary;
  useEffect(() => {
    askTrend({ question: `Why is ${symbol} showing its current trend?`, context: { symbol } });
    askSummary({ question: `Summarize the available technical indicators for ${symbol}`, context: { symbol } });
  }, [symbol, askTrend, askSummary]);
  return (
    <Stagger className="grid gap-4 lg:grid-cols-2">
      {[
        { m: trend, title: 'Trend explanation' },
        { m: summary, title: 'Indicator summary' },
      ].map(({ m, title }) => (
        <Panel key={title} title={title} action={<Badge tone="info">Rule-based, local</Badge>} bodyClassName="p-4">
          {m.isPending ? (
            <SkeletonRows rows={6} className="p-0" />
          ) : m.isError ? (
            <ErrorState error={m.error} />
          ) : m.data ? (
            <div>
              <Markdown text={m.data.answer} />
              {m.data.data.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 border-t border-rule pt-3">
                  {m.data.data.map((d) => (
                    <KV key={d.label} k={d.label} v={d.value} />
                  ))}
                </dl>
              )}
              {m.data.disclaimers.map((d) => (
                <p key={d} className="mt-2 text-[11px] text-faint">
                  {d}
                </p>
              ))}
            </div>
          ) : null}
        </Panel>
      ))}
    </Stagger>
  );
}

function StockView({ symbol }: { symbol: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'overview');
  const [tf, setTf] = useState<Timeframe>('1d');
  const [trade, setTrade] = useState(false);
  const stock = useStock(symbol);
  const analysis = useAnalysis(symbol, tf);
  const [sigFilter, setSigFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL');

  useEffect(() => {
    try {
      localStorage.setItem('quantdesk-last-symbol', symbol);
    } catch {
      /* storage unavailable */
    }
  }, [symbol]);

  const change = (t: Tab) => {
    setTab(t);
    router.replace(`/stocks/${symbol}?tab=${t}`, { scroll: false });
  };

  if (stock.isError)
    return (
      <Page>
        <div className="panel">
          <ErrorState error={stock.error} onRetry={() => stock.refetch()} />
        </div>
      </Page>
    );
  if (!stock.data)
    return (
      <Page>
        <Skeleton className="mb-3 h-8 w-48" />
        <Skeleton className="mb-6 h-10 w-72" />
        <Skeleton className="h-[480px]" />
      </Page>
    );

  const s = stock.data;
  const a = analysis.data;
  const signals = (a?.signals ?? []).filter((x) => sigFilter === 'ALL' || x.action === sigFilter);
  const active = (a?.signals ?? []).filter((x) => x.action !== 'HOLD');

  return (
    <Page>
      <Header s={s} onTrade={() => setTrade(true)} />
      <Tabs
        value={tab}
        onChange={change}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'chart', label: 'Chart' },
          { value: 'technical', label: 'Technical analysis' },
          { value: 'fundamentals', label: 'Fundamentals' },
          { value: 'performance', label: 'Historical performance' },
          { value: 'ai', label: 'AI insights' },
          { value: 'signals', label: `Trading signals${active.length ? ` · ${active.length}` : ''}` },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="pt-4">
          {tab === 'overview' && (
            <Stagger className="grid gap-4 xl:grid-cols-12">
              <Panel className="xl:col-span-8" bodyClassName="">
                <ChartWorkspace symbol={symbol} available={s.available_timeframes} compact />
              </Panel>
              <Panel className="xl:col-span-4" title="Read of the daily chart" action={a ? <SourceBadge source={a.data_source} /> : null}>
                {a ? <TrendSummary a={a} /> : analysis.isError ? <ErrorState error={analysis.error} /> : <SkeletonRows rows={8} />}
              </Panel>
              <Panel className="xl:col-span-4" title="Session" bodyClassName="px-4 py-1">
                <KV k="Open" v={price(s.stats.open)} />
                <KV k="Day high" v={price(s.stats.day_high)} />
                <KV k="Day low" v={price(s.stats.day_low)} />
                <KV k="Previous close" v={price(s.prev_close)} />
                <KV k="Volume" v={compact(s.volume)} />
                <KV k="20-day avg volume" v={compact(s.stats.avg_volume_20d)} />
              </Panel>
              <Panel className="xl:col-span-4" title="About" bodyClassName="p-4">
                <p className="text-[13px] leading-relaxed text-ink/85">{s.description}</p>
                <div className="mt-3">
                  <KV k="ISIN" v={s.isin ?? '—'} />
                  <KV k="Market cap" v={s.market_cap ? `₹${price(s.market_cap, 0)} Cr` : '—'} />
                  <KV k="P/E" v={s.fundamentals.pe_ratio?.toFixed(1) ?? '—'} />
                </div>
              </Panel>
              <Panel
                className="xl:col-span-4"
                title="Strategy read-out"
                action={
                  <button onClick={() => change('signals')} className="text-xs text-muted hover:text-ink">
                    Details
                  </button>
                }
              >
                {a ? (
                  <ul>
                    {a.signals.map((x) => (
                      <li key={x.strategy_key} className="flex h-9 items-center gap-3 border-t border-rule px-4 text-[13px] first:border-t-0">
                        <span className={cn('w-10 text-xs font-semibold', x.action === 'BUY' ? 'text-up' : x.action === 'SELL' ? 'text-down' : 'text-faint')}>{x.action}</span>
                        <span className="min-w-0 flex-1 truncate text-muted">{x.strategy}</span>
                        <StrengthMeter score={x.strength.score} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <SkeletonRows rows={6} />
                )}
              </Panel>
            </Stagger>
          )}

          {tab === 'chart' && (
            <div className="panel overflow-hidden">
              <ChartWorkspace symbol={symbol} available={s.available_timeframes} />
            </div>
          )}

          {tab === 'technical' && (
            <div>
              <div className="mb-3 flex items-center gap-3 text-xs text-muted">
                Timeframe
                <Tabs
                  ruled={false}
                  size="sm"
                  value={tf}
                  onChange={setTf}
                  items={s.available_timeframes.filter((t) => ['15m', '1h', '1d', '1w'].includes(t)).map((t) => ({ value: t, label: t }))}
                />
              </div>
              {a ? <TechnicalTab a={a} /> : analysis.isError ? <ErrorState error={analysis.error} /> : <SkeletonRows rows={10} />}
            </div>
          )}

          {tab === 'fundamentals' && (
            <Stagger className="grid gap-4 lg:grid-cols-2">
              <Panel title="Valuation" action={<SourceBadge source={s.fundamentals.data_source} />} bodyClassName="px-4 py-1">
                <KV k="Market capitalisation" v={s.fundamentals.market_cap ? `₹${price(s.fundamentals.market_cap, 0)} Cr` : '—'} />
                <KV k="Price / earnings" v={s.fundamentals.pe_ratio?.toFixed(2) ?? '—'} />
                <KV k="Price / book" v={s.fundamentals.pb_ratio?.toFixed(2) ?? '—'} />
                <KV k="Earnings per share" v={s.fundamentals.eps ? `₹${price(s.fundamentals.eps)}` : '—'} />
              </Panel>
              <Panel title="Per share" bodyClassName="px-4 py-1">
                <KV k="Book value" v={s.fundamentals.book_value ? `₹${price(s.fundamentals.book_value)}` : '—'} />
                <KV k="Dividend yield" v={pct(s.fundamentals.dividend_yield, 2, false)} />
                <KV k="Face value" v={s.fundamentals.face_value ? `₹${price(s.fundamentals.face_value)}` : '—'} />
                <KV k="ISIN" v={s.isin ?? '—'} />
              </Panel>
              <p className="text-xs text-muted lg:col-span-2">
                Fundamentals shown are {s.fundamentals.data_source === 'SIMULATED' ? 'generated demo values for interface testing, not company filings' : 'from the imported dataset'}. A
                dash means the dataset has no value.
              </p>
            </Stagger>
          )}

          {tab === 'performance' && <PerformanceTab s={s} />}
          {tab === 'ai' && <AiTab symbol={symbol} />}

          {tab === 'signals' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs
                  ruled={false}
                  size="sm"
                  value={sigFilter}
                  onChange={setSigFilter}
                  items={(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map((v) => ({ value: v, label: v === 'ALL' ? 'All strategies' : v.toLowerCase() }))}
                />
                <p className="text-xs text-muted">Strength scores rank how clearly conditions are met. They are not probabilities of profit.</p>
              </div>
              {!a ? (
                <SkeletonRows rows={8} />
              ) : signals.length === 0 ? (
                <div className="panel">
                  <EmptyState title="No strategy is in this state" />
                </div>
              ) : (
                signals.map((x) => <SignalCard key={x.strategy_key} s={x} />)
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <Dialog open={trade} onOpenChange={setTrade}>
        <DialogContent title={`Paper trade ${s.symbol}`} description="Simulated execution against the local market feed.">
          <OrderTicket symbol={s.symbol} refPrice={s.price} onDone={() => setTrade(false)} />
        </DialogContent>
      </Dialog>
    </Page>
  );
}

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  return (
    <Suspense>
      <StockView symbol={decodeURIComponent(symbol).toUpperCase()} />
    </Suspense>
  );
}
