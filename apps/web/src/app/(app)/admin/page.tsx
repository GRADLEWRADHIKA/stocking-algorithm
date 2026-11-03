'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Pause, Play, RefreshCw, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, get, patch, post } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { compact, dateTime, int, relative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DatasetValidationReport, User } from '@shared/types/api';

type Health = {
  status: string;
  database: string;
  simulator: { running: boolean; ticks: number; ws_clients?: number; errors?: number } | string;
  uptime_seconds: number;
  version: string;
  counts: Record<string, number>;
};
type Sim = { running: boolean; seed: number; tick_interval_ms: number; regime?: string; ticks?: number; last_tick_at?: string | null; [k: string]: unknown };
type AdminStock = { symbol: string; name: string; exchange: string; sector: string; is_active: boolean; data_source: string; market_cap?: number | null; candles?: number };
type Audit = { id: number; created_at: string; user_id: number | null; action: string; entity_type: string | null; entity_id: string | null; success: boolean; details?: Record<string, unknown> | null; ip_address?: string | null };
type Job = { name: string; status: string; last_run?: string | null; runs?: number; last_error?: string | null; [k: string]: unknown };
type DatasetImport = { id: number; filename: string; created_at: string; rows: number; valid_rows: number; imported_rows?: number; status?: string };

function HealthPanel() {
  const h = useQuery({ queryKey: ['admin', 'health'], queryFn: () => get<Health>('/admin/health'), refetchInterval: 10_000 });
  if (h.isError) return <ErrorState error={h.error} onRetry={() => h.refetch()} />;
  if (!h.data) return <SkeletonRows rows={4} />;
  const d = h.data;
  const ok = (s: string) => ['ok', 'running', 'healthy', 'up'].some((w) => s.toLowerCase().startsWith(w));
  return (
    <div>
      <div className="grid grid-cols-2 border-b border-rule md:grid-cols-4">
        {[
          ['API', d.status],
          ['Database', d.database],
          ['Simulator', typeof d.simulator === 'string' ? d.simulator : `${d.simulator.running ? 'running' : 'stopped'} · ${int(d.simulator.ticks)} ticks · ${d.simulator.ws_clients ?? 0} clients`],
          ['Uptime', `${Math.floor(d.uptime_seconds / 3600)}h ${Math.floor((d.uptime_seconds % 3600) / 60)}m`],
        ].map(([k, v], i) => (
          <div key={k} className={cn('px-4 py-3', i > 0 && 'border-l border-rule')}>
            <div className="label">{k}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px]">
              {k !== 'Uptime' && <span className={cn('h-1.5 w-1.5 rounded-full', ok(String(v)) ? 'bg-up' : 'bg-warn')} />}
              {v}
            </div>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 px-4 py-2 sm:grid-cols-4">
        {Object.entries(d.counts).map(([k, v]) => (
          <div key={k} className="flex justify-between border-t border-rule py-2 text-[13px] first:border-t-0">
            <dt className="text-muted">{k.replace(/_/g, ' ')}</dt>
            <dd className="num">{int(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="px-4 pb-3 text-[11px] text-faint">Version {d.version}</p>
    </div>
  );
}

function SimulatorPanel() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['admin', 'sim'], queryFn: () => get<Sim>('/admin/simulator'), refetchInterval: 5_000 });
  const [seed, setSeed] = useState('');
  const [interval, setIntervalMs] = useState('');
  const [regime, setRegime] = useState('');
  const act = useMutation({
    mutationFn: (b: Record<string, unknown>) => post<Sim>('/admin/simulator', b),
    onSuccess: (d) => {
      qc.setQueryData(['admin', 'sim'], d);
      toast.success('Simulator updated');
    },
    onError: (e) => toast.error(e.message),
  });
  if (s.isError) return <ErrorState error={s.error} />;
  if (!s.data) return <SkeletonRows rows={4} />;
  const d = s.data;
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={d.running ? 'up' : 'neutral'}>{d.running ? 'running' : 'stopped'}</Badge>
        <span className="num text-xs text-muted">
          seed {d.seed} · tick every {d.tick_interval_ms} ms{d.regime ? ` · regime ${d.regime}` : ''}
          {d.last_tick_at ? ` · last tick ${relative(d.last_tick_at)}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={d.running ? 'secondary' : 'primary'} loading={act.isPending} onClick={() => act.mutate({ action: d.running ? 'stop' : 'start' })}>
          {d.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {d.running ? 'Pause feed' : 'Start feed'}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input type="number" placeholder={`Seed (${d.seed})`} value={seed} onChange={(e) => setSeed(e.target.value)} className="num" aria-label="Seed" />
        <Input type="number" placeholder={`Interval ms (${d.tick_interval_ms})`} value={interval} onChange={(e) => setIntervalMs(e.target.value)} className="num" aria-label="Tick interval" />
        <Select value={regime} onChange={(e) => setRegime(e.target.value)} aria-label="Regime">
          <option value="">Regime: automatic</option>
          <option value="bull">Force bull</option>
          <option value="bear">Force bear</option>
          <option value="sideways">Force sideways</option>
          <option value="high_vol">Force high volatility</option>
        </Select>
        <Button
          size="md"
          onClick={() =>
            act.mutate({
              action: 'reseed',
              ...(seed ? { seed: Number(seed) } : {}),
              ...(interval ? { tick_interval_ms: Number(interval) } : {}),
              ...(regime ? { regime } : {}),
            })
          }
          loading={act.isPending}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Apply
        </Button>
      </div>
      <p className="text-[11px] text-faint">The simulator is deterministic for a given seed, so tests and demos are reproducible.</p>
    </div>
  );
}

function DatasetsPanel() {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<(DatasetValidationReport & { imported_rows?: number }) | null>(null);
  const [busy, setBusy] = useState<'validate' | 'import' | null>(null);
  const imports = useQuery({ queryKey: ['admin', 'datasets'], queryFn: () => get<DatasetImport[]>('/admin/datasets') });

  const send = async (mode: 'validate' | 'import') => {
    const f = file.current?.files?.[0];
    if (!f) return toast.error('Choose a CSV file first');
    if (!/\.csv$/i.test(f.name)) return toast.error('Only .csv files are accepted');
    const fd = new FormData();
    fd.append('file', f);
    setBusy(mode);
    try {
      const r = await api<DatasetValidationReport & { imported_rows?: number }>(`/admin/datasets/${mode}`, { method: 'POST', body: fd });
      setReport(r);
      if (mode === 'import') {
        toast.success(`Imported ${int(r.imported_rows ?? 0)} rows`);
        qc.invalidateQueries({ queryKey: ['admin'] });
        qc.invalidateQueries({ queryKey: ['stocks'] });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="text-[13px] text-muted">
          CSV columns: <code className="num text-xs text-ink">timestamp, open, high, low, close, volume, symbol, exchange</code>. Validation checks types, OHLC consistency, duplicates, zero
          volume and gaps before anything is written. Imported rows are labelled Historical dataset.
        </p>
        <input ref={file} type="file" accept=".csv,text/csv" className="block w-full text-xs text-muted file:mr-3 file:rounded-ctl file:border-0 file:bg-raised file:px-3 file:py-2 file:text-ink" />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => send('validate')} loading={busy === 'validate'}>
            Validate only
          </Button>
          <Button size="sm" variant="primary" onClick={() => send('import')} loading={busy === 'import'} disabled={report !== null && !report.is_valid}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
        </div>
        <AnimatePresence>
          {report && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-card border border-line p-3 text-xs">
              <div className="flex items-center gap-2 text-[13px]">
                {report.is_valid ? <CheckCircle2 className="h-4 w-4 text-up" /> : <XCircle className="h-4 w-4 text-down" />}
                {report.filename}: {int(report.valid_rows)} of {int(report.rows)} rows valid
                {report.imported_rows !== undefined && <span className="text-muted">· {int(report.imported_rows)} imported</span>}
              </div>
              <p className="mt-1 text-muted">
                Symbols {report.symbols.join(', ') || '—'} · duplicates removed {report.duplicates_removed}
              </p>
              {[...report.errors.slice(0, 8).map((e) => ({ ...e, k: 'e' })), ...report.warnings.slice(0, 8).map((w) => ({ ...w, k: 'w' }))].map((x, i) => (
                <p key={i} className={x.k === 'e' ? 'text-down' : 'text-warn'}>
                  {x.row !== null ? `Row ${x.row}: ` : ''}
                  {x.message}
                </p>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div>
        <div className="label mb-2">Import history</div>
        {(imports.data ?? []).length === 0 ? (
          <p className="text-xs text-muted">No imports yet. A sample file ships in datasets/historical/sample_ohlcv.csv.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>File</th>
                <th className="r">Rows</th>
                <th className="r">When</th>
              </tr>
            </thead>
            <tbody>
              {imports.data!.map((d) => (
                <tr key={d.id}>
                  <td className="max-w-[200px] truncate">{d.filename}</td>
                  <td className="r num">
                    {int(d.imported_rows ?? d.valid_rows)}/{int(d.rows)}
                  </td>
                  <td className="r text-xs text-muted">{relative(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UsersPanel() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const u = useQuery({ queryKey: ['admin', 'users'], queryFn: () => get<User[]>('/admin/users') });
  const upd = useMutation({
    mutationFn: (b: { id: number; role?: string; is_active?: boolean }) => patch<User>(`/admin/users/${b.id}`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (e) => toast.error(e.message),
  });
  if (u.isError) return <ErrorState error={u.error} />;
  if (!u.data) return <SkeletonRows />;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>User</th>
          <th>Role</th>
          <th>Status</th>
          <th className="r">Joined</th>
        </tr>
      </thead>
      <tbody>
        {u.data.map((x) => (
          <tr key={x.id}>
            <td>
              <div>{x.full_name}</div>
              <div className="text-xs text-muted">{x.email}</div>
            </td>
            <td>
              <Select value={x.role} disabled={x.id === me?.id} onChange={(e) => upd.mutate({ id: x.id, role: e.target.value })} className="h-7 w-auto text-xs" aria-label={`Role for ${x.email}`}>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </td>
            <td>
              <button disabled={x.id === me?.id} onClick={() => upd.mutate({ id: x.id, is_active: !x.is_active })} className="disabled:opacity-50">
                <Badge tone={x.is_active ? 'up' : 'down'}>{x.is_active ? 'active' : 'disabled'}</Badge>
              </button>
            </td>
            <td className="r num text-xs text-muted">{dateTime(x.created_at, false)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StocksPanel() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['admin', 'stocks'], queryFn: () => get<AdminStock[]>('/admin/stocks') });
  const [filter, setFilter] = useState('');
  const toggle = useMutation({
    mutationFn: (b: { symbol: string; is_active: boolean }) => patch(`/admin/stocks/${b.symbol}`, { is_active: b.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'stocks'] });
      qc.invalidateQueries({ queryKey: ['stocks'] });
    },
    onError: (e) => toast.error(e.message),
  });
  if (s.isError) return <ErrorState error={s.error} />;
  if (!s.data) return <SkeletonRows />;
  const rows = s.data.filter((x) => !filter || x.symbol.includes(filter.toUpperCase()) || x.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div>
      <div className="border-b border-rule p-3">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter instruments" className="h-8 max-w-xs" />
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="tbl">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th>Symbol</th>
              <th>Sector</th>
              <th>Source</th>
              <th className="r">Mcap ₹Cr</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={`${x.exchange}-${x.symbol}`}>
                <td>
                  <span className="font-medium">{x.symbol}</span> <span className="text-[11px] text-faint">{x.exchange}</span>
                  <div className="max-w-[240px] truncate text-xs text-muted">{x.name}</div>
                </td>
                <td className="text-muted">{x.sector}</td>
                <td className="text-xs text-muted">{x.data_source.toLowerCase().replace(/_/g, ' ')}</td>
                <td className="r num">{x.market_cap ? compact(x.market_cap) : '—'}</td>
                <td>
                  <button onClick={() => toggle.mutate({ symbol: x.symbol, is_active: !x.is_active })}>
                    <Badge tone={x.is_active ? 'up' : 'neutral'}>{x.is_active ? 'listed' : 'hidden'}</Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogsPanel() {
  const logs = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => get<Audit[]>('/admin/audit-logs?limit=100'), refetchInterval: 15_000 });
  const jobs = useQuery({ queryKey: ['admin', 'jobs'], queryFn: () => get<Job[]>('/admin/jobs'), refetchInterval: 10_000 });
  const cfg = useQuery({ queryKey: ['admin', 'config'], queryFn: () => get<Record<string, unknown>>('/admin/config') });
  const backtests = useQuery({ queryKey: ['admin', 'backtests'], queryFn: () => get<{ id: number; symbol: string; strategy_name: string; created_at: string; total_return_pct?: number; user_email?: string }[]>('/admin/backtests') });
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div>
        <div className="label mb-2">Background jobs</div>
        {(jobs.data ?? []).map((j) => (
          <div key={j.name} className="flex items-center justify-between border-t border-rule py-2 text-[13px] first:border-t-0">
            <span>{j.name}</span>
            <span className="flex items-center gap-2 text-xs text-muted">
              {j.last_run ? relative(j.last_run) : '—'}
              <Badge tone={j.last_error ? 'down' : j.status === 'running' ? 'up' : 'neutral'}>{j.last_error ? 'error' : j.status}</Badge>
            </span>
          </div>
        ))}
        <div className="label mb-2 mt-5">Configuration (secrets redacted)</div>
        <dl>
          {Object.entries(cfg.data ?? {}).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-t border-rule py-1.5 text-xs first:border-t-0">
              <dt className="text-muted">{k}</dt>
              <dd className="num max-w-[60%] truncate text-right">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
        <div className="label mb-2 mt-5">Recent backtests, all users</div>
        {(backtests.data ?? []).slice(0, 8).map((b) => (
          <div key={b.id} className="flex justify-between border-t border-rule py-1.5 text-xs first:border-t-0">
            <span>
              {b.symbol} · {b.strategy_name}
            </span>
            <span className="text-muted">{relative(b.created_at)}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="label mb-2">Audit log</div>
        {logs.isError ? (
          <ErrorState error={logs.error} />
        ) : (
          <ul className="max-h-[560px] overflow-auto">
            {(logs.data ?? []).map((l) => (
              <li key={l.id} className="border-t border-rule py-2 text-xs first:border-t-0">
                <div className="flex justify-between gap-2">
                  <span className={cn('font-medium', l.success ? 'text-ink' : 'text-down')}>{l.action}</span>
                  <span className="num text-faint">{dateTime(l.created_at)}</span>
                </div>
                <div className="truncate text-muted">
                  {l.user_id ? `user #${l.user_id}` : 'system'}
                  {l.entity_type ? ` · ${l.entity_type} ${l.entity_id ?? ''}` : ''}
                  {l.details && Object.keys(l.details).length ? ` · ${JSON.stringify(l.details)}` : ''}
                  {l.ip_address ? ` · ${l.ip_address}` : ''}
                </div>
              </li>
            ))}
            {(logs.data ?? []).length === 0 && <EmptyState title="No audit entries" />}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<'overview' | 'datasets' | 'users' | 'stocks' | 'logs'>('overview');
  if (user && user.role !== 'ADMIN')
    return (
      <Page>
        <div className="panel">
          <EmptyState title="Administrators only" body="Your account does not have the administrator role." />
        </div>
      </Page>
    );
  return (
    <Page>
      <PageHeader title="Administration" sub="System health, market simulator, datasets, users and audit trail." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'Health and simulator' },
          { value: 'datasets', label: 'Datasets' },
          { value: 'users', label: 'Users' },
          { value: 'stocks', label: 'Instruments' },
          { value: 'logs', label: 'Jobs, config and logs' },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="pt-4">
          <Stagger className="grid gap-4">
            {tab === 'overview' && (
              <>
                <Panel title="API health">
                  <HealthPanel />
                </Panel>
                <Panel title="Market simulator">
                  <SimulatorPanel />
                </Panel>
              </>
            )}
            {tab === 'datasets' && (
              <Panel title="Historical dataset import">
                <DatasetsPanel />
              </Panel>
            )}
            {tab === 'users' && (
              <Panel title="Users">
                <UsersPanel />
              </Panel>
            )}
            {tab === 'stocks' && (
              <Panel title="Instruments">
                <StocksPanel />
              </Panel>
            )}
            {tab === 'logs' && (
              <Panel title="Operations">
                <LogsPanel />
              </Panel>
            )}
          </Stagger>
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}

