import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Pause, Play, RefreshCw} from 'lucide-react-native';
import {
  useAdminAudit,
  useAdminBacktests,
  useAdminConfig,
  useAdminDatasets,
  useAdminHealth,
  useAdminJobs,
  useAdminMutations,
  useAdminStocks,
  useAdminUsers,
} from '../api/hooks';
import type {Role} from '../api/types';
import {Badge, Button, EmptyState, ErrorState, KV, Panel, Screen, SelectField, SkeletonRows, Tabs, TextField, Txt, toast} from '../components';
import {useAuthStore} from '../store/auth';
import {usePalette} from '../theme';
import {compact, dateTime, int, relative} from '../utils/fmt';

type Tab = 'overview' | 'datasets' | 'users' | 'stocks' | 'logs';
const ok = (s: string) => ['ok', 'running', 'healthy', 'up'].some(w => s.toLowerCase().startsWith(w));

function HealthPanel() {
  const p = usePalette();
  const h = useAdminHealth();
  if (h.isError) {
    return <ErrorState error={h.error} onRetry={() => h.refetch()} />;
  }
  if (!h.data) {
    return <SkeletonRows rows={4} />;
  }
  const d = h.data;
  const sim = d.simulator;
  const cells: [string, string][] = [
    ['API', d.status],
    ['Database', d.database],
    ['Simulator', `${sim.running ? 'running' : 'stopped'} · ${int(sim.ticks)} ticks · ${sim.ws_clients ?? 0} clients`],
    ['Uptime', `${Math.floor(d.uptime_seconds / 3600)}h ${Math.floor((d.uptime_seconds % 3600) / 60)}m`],
  ];
  return (
    <View>
      <View style={[styles.cells, {borderBottomColor: p.rule}]}>
        {cells.map(([k, v]) => (
          <View key={k} style={styles.cell}>
            <Txt variant="caption" tone="muted">
              {k}
            </Txt>
            <View style={styles.inline}>
              {k !== 'Uptime' ? <View style={[styles.dot, {backgroundColor: ok(v) ? p.up : p.warn}]} /> : null}
              <Txt variant="small" style={styles.flex}>
                {v}
              </Txt>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.pad}>
        {Object.entries(d.counts).map(([k, v], i) => (
          <KV key={k} first={i === 0} k={k.replace(/_/g, ' ')} v={int(v)} />
        ))}
        <Txt variant="micro" tone="faint" style={styles.mt}>
          Version {d.version}
        </Txt>
      </View>
    </View>
  );
}

function SimulatorPanel() {
  const p = usePalette();
  const h = useAdminHealth();
  const {simulator: act} = useAdminMutations();
  const [seed, setSeed] = useState('');
  const [interval, setIntervalMs] = useState('');
  const [regime, setRegime] = useState<'' | 'bull' | 'bear' | 'sideways' | 'high_vol'>('');
  if (h.isError) {
    return <ErrorState error={h.error} />;
  }
  if (!h.data) {
    return <SkeletonRows rows={4} />;
  }
  const d = h.data.simulator;
  const run = (b: Parameters<typeof act.mutate>[0]) =>
    act.mutate(b, {onSuccess: () => toast.success('Simulator updated'), onError: e => toast.error((e as Error).message)});
  return (
    <View style={styles.simBody}>
      <View style={styles.inlineWrap}>
        <Badge label={d.running ? 'running' : 'stopped'} tone={d.running ? 'up' : 'neutral'} />
        <Txt variant="caption" num tone="muted" style={styles.flex}>
          seed {d.seed} · tick every {d.tick_interval_ms} ms{d.regime ? ` · regime ${d.regime}` : ''}
          {d.last_tick_at ? ` · last tick ${relative(d.last_tick_at)}` : ''}
        </Txt>
      </View>
      <Button
        testID="sim-toggle"
        size="sm"
        variant={d.running ? 'secondary' : 'primary'}
        title={d.running ? 'Pause feed' : 'Start feed'}
        icon={d.running ? <Pause size={14} color={p.ink} /> : <Play size={14} color={p.ground} />}
        loading={act.isPending}
        onPress={() => run({action: d.running ? 'stop' : 'start'})}
        style={styles.start}
      />
      <View style={styles.row2}>
        <TextField containerStyle={styles.flex} size="sm" placeholder={`Seed (${d.seed})`} value={seed} onChangeText={setSeed} keyboardType="number-pad" accessibilityLabel="Seed" />
        <TextField
          containerStyle={styles.flex}
          size="sm"
          placeholder={`Interval ms (${d.tick_interval_ms})`}
          value={interval}
          onChangeText={setIntervalMs}
          keyboardType="number-pad"
          accessibilityLabel="Tick interval"
        />
      </View>
      <SelectField
        size="sm"
        accessibilityLabel="Regime"
        value={regime}
        onChange={setRegime}
        options={[
          {value: '', label: 'Regime: automatic'},
          {value: 'bull', label: 'Force bull'},
          {value: 'bear', label: 'Force bear'},
          {value: 'sideways', label: 'Force sideways'},
          {value: 'high_vol', label: 'Force high volatility'},
        ]}
      />
      <Button
        testID="sim-apply"
        size="sm"
        title="Apply"
        icon={<RefreshCw size={14} color={p.ink} />}
        loading={act.isPending}
        onPress={() =>
          run({
            action: 'reseed',
            ...(seed ? {seed: Number(seed)} : {}),
            ...(interval ? {tick_interval_ms: Number(interval)} : {}),
            ...(regime ? {regime} : {}),
          })
        }
        style={styles.start}
      />
      <Txt variant="micro" tone="faint">
        The simulator is deterministic for a given seed, so tests and demos are reproducible.
      </Txt>
    </View>
  );
}

function DatasetsPanel() {
  const imports = useAdminDatasets();
  return (
    <View style={styles.pad}>
      <Txt variant="small" tone="muted">
        CSV columns: timestamp, open, high, low, close, volume, symbol, exchange. Validation checks types, OHLC consistency, duplicates, zero volume
        and gaps before anything is written. Imported rows are labelled Historical dataset.
      </Txt>
      <View style={styles.note}>
        <Badge label="Web only" tone="info" />
        <Txt variant="caption" tone="muted" style={styles.flex}>
          Validate and import run from the website's Admin page: the app has no file-picker dependency, so it cannot upload a CSV.
        </Txt>
      </View>
      <Txt variant="caption" tone="muted" style={styles.mt}>
        Import history
      </Txt>
      {imports.isError ? (
        <ErrorState error={imports.error} compact />
      ) : (imports.data ?? []).length === 0 ? (
        <Txt variant="caption" tone="muted" style={styles.mt}>
          No imports yet. A sample file ships in datasets/historical/sample_ohlcv.csv.
        </Txt>
      ) : (
        imports.data!.map((d, i) => (
          <KV
            key={d.id}
            first={i === 0}
            k={d.filename}
            v={`${int(Number(d.imported_rows ?? d.valid_rows ?? 0))}/${int(Number(d.rows ?? 0))} · ${relative(d.created_at)}`}
          />
        ))
      )}
    </View>
  );
}

function UsersPanel() {
  const p = usePalette();
  const me = useAuthStore(s => s.user);
  const u = useAdminUsers();
  const {updateUser} = useAdminMutations();
  if (u.isError) {
    return <ErrorState error={u.error} />;
  }
  if (!u.data) {
    return <SkeletonRows />;
  }
  const upd = (b: {id: number; role?: Role; is_active?: boolean}) => updateUser.mutate(b, {onError: e => toast.error((e as Error).message)});
  return (
    <View>
      {u.data.map((x, i) => {
        const self = x.id === me?.id;
        return (
          <View key={x.id} testID={`admin-user-${x.id}`} style={[styles.listRow, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}]}>
            <View style={styles.flex}>
              <Txt variant="small">{x.full_name}</Txt>
              <Txt variant="caption" tone="muted">
                {x.email}
              </Txt>
              <Txt variant="micro" num tone="faint">
                joined {dateTime(x.created_at, false)}
              </Txt>
            </View>
            <View style={styles.userCtl}>
              {self ? (
                <Badge label={x.role === 'ADMIN' ? 'Admin' : 'User'} />
              ) : (
                <SelectField
                  size="sm"
                  accessibilityLabel={`Role for ${x.email}`}
                  value={x.role}
                  onChange={role => upd({id: x.id, role})}
                  options={[
                    {value: 'USER', label: 'User'},
                    {value: 'ADMIN', label: 'Admin'},
                  ]}
                />
              )}
              <Pressable
                disabled={self}
                accessibilityRole="switch"
                accessibilityState={{checked: x.is_active, disabled: self}}
                accessibilityLabel={`${x.email} ${x.is_active ? 'active' : 'disabled'}`}
                onPress={() => upd({id: x.id, is_active: !x.is_active})}
                style={self ? styles.dim : null}>
                <Badge label={x.is_active ? 'active' : 'disabled'} tone={x.is_active ? 'up' : 'down'} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StocksPanel() {
  const p = usePalette();
  const s = useAdminStocks();
  const {updateStock} = useAdminMutations();
  const [filter, setFilter] = useState('');
  if (s.isError) {
    return <ErrorState error={s.error} />;
  }
  if (!s.data) {
    return <SkeletonRows />;
  }
  const rows = s.data.filter(x => !filter || x.symbol.includes(filter.toUpperCase()) || x.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <View>
      <View style={[styles.pad, {borderBottomWidth: 1, borderBottomColor: p.rule}]}>
        <TextField size="sm" value={filter} onChangeText={setFilter} placeholder="Filter instruments" accessibilityLabel="Filter instruments" />
      </View>
      {rows.map((x, i) => (
        <View key={`${x.exchange}-${x.symbol}`} style={[styles.listRow, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}]}>
          <View style={styles.flex}>
            <Txt variant="small" weight="500">
              {x.symbol}{' '}
              <Txt variant="micro" tone="faint">
                {x.exchange}
              </Txt>
            </Txt>
            <Txt variant="caption" tone="muted" numberOfLines={1}>
              {x.name}
            </Txt>
            <Txt variant="micro" tone="faint" numberOfLines={1}>
              {x.sector} · {x.data_source.toLowerCase().replace(/_/g, ' ')} · mcap ₹Cr <Txt variant="micro" num tone="faint">{x.market_cap ? compact(x.market_cap) : '—'}</Txt>
            </Txt>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{checked: x.is_active}}
            accessibilityLabel={`${x.symbol} ${x.is_active ? 'listed' : 'hidden'}`}
            onPress={() => updateStock.mutate({symbol: x.symbol, is_active: !x.is_active}, {onError: e => toast.error((e as Error).message)})}>
            <Badge label={x.is_active ? 'listed' : 'hidden'} tone={x.is_active ? 'up' : 'neutral'} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function LogsPanel() {
  const p = usePalette();
  const jobs = useAdminJobs();
  const cfg = useAdminConfig();
  const logs = useAdminAudit();
  const backtests = useAdminBacktests();
  return (
    <View style={styles.pad}>
      <Txt variant="caption" tone="muted" style={styles.label}>
        Background jobs
      </Txt>
      {(jobs.data ?? []).map((j, i) => (
        <View key={j.name} style={[styles.inlineBetween, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}]}>
          <Txt variant="small" style={styles.flex}>
            {j.name}
          </Txt>
          <Txt variant="caption" tone="muted">
            {j.last_run ? relative(j.last_run) : '—'}
          </Txt>
          <Badge label={j.status} tone={j.status === 'running' ? 'up' : 'neutral'} />
        </View>
      ))}
      <Txt variant="caption" tone="muted" style={[styles.label, styles.mt]}>
        Configuration (secrets redacted)
      </Txt>
      {Object.entries(cfg.data ?? {}).map(([k, v], i) => (
        <KV key={k} first={i === 0} k={k} v={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
      ))}
      <Txt variant="caption" tone="muted" style={[styles.label, styles.mt]}>
        Recent backtests, all users
      </Txt>
      {(backtests.data ?? []).slice(0, 8).map((b, i) => (
        <KV key={b.id} first={i === 0} k={`${b.symbol} · ${b.strategy_name}`} v={relative(b.created_at)} />
      ))}
      <Txt variant="caption" tone="muted" style={[styles.label, styles.mt]}>
        Audit log
      </Txt>
      {logs.isError ? (
        <ErrorState error={logs.error} compact />
      ) : (logs.data ?? []).length === 0 ? (
        <EmptyState title="No audit entries" />
      ) : (
        logs.data!.map((l, i) => (
          <View key={l.id} style={[styles.audit, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}]}>
            <View style={styles.inlineBetween0}>
              <Txt variant="caption" weight="500" tone={l.success ? 'ink' : 'down'} style={styles.flex}>
                {l.action}
              </Txt>
              <Txt variant="micro" num tone="faint">
                {dateTime(l.created_at)}
              </Txt>
            </View>
            <Txt variant="micro" tone="muted" numberOfLines={2}>
              {l.user_id ? `user #${l.user_id}` : 'system'}
              {l.entity_type ? ` · ${l.entity_type} ${l.entity_id ?? ''}` : ''}
              {l.details && Object.keys(l.details).length ? ` · ${JSON.stringify(l.details)}` : ''}
              {l.ip_address ? ` · ${l.ip_address}` : ''}
            </Txt>
          </View>
        ))
      )}
    </View>
  );
}

export function AdminScreen() {
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState<Tab>('overview');
  if (user && user.role !== 'ADMIN') {
    return (
      <Screen back title="Administration" testID="admin-screen">
        <Panel>
          <EmptyState title="Administrators only" body="Your account does not have the administrator role." />
        </Panel>
      </Screen>
    );
  }
  return (
    <Screen
      back
      title="Administration"
      subtitle="System health, market simulator, datasets, users and audit trail."
      testID="admin-screen"
      keyboard
      headerExtra={
        <Tabs
          testID="admin-tabs"
          value={tab}
          onChange={setTab}
          items={[
            {value: 'overview', label: 'Health and simulator'},
            {value: 'datasets', label: 'Datasets'},
            {value: 'users', label: 'Users'},
            {value: 'stocks', label: 'Instruments'},
            {value: 'logs', label: 'Jobs, config and logs'},
          ]}
        />
      }>
      {tab === 'overview' ? (
        <>
          <Panel key="h" index={0} title="API health">
            <HealthPanel />
          </Panel>
          <Panel key="s" index={1} title="Market simulator">
            <SimulatorPanel />
          </Panel>
        </>
      ) : tab === 'datasets' ? (
        <Panel key="d" index={0} title="Historical dataset import">
          <DatasetsPanel />
        </Panel>
      ) : tab === 'users' ? (
        <Panel key="u" index={0} title="Users">
          <UsersPanel />
        </Panel>
      ) : tab === 'stocks' ? (
        <Panel key="i" index={0} title="Instruments">
          <StocksPanel />
        </Panel>
      ) : (
        <Panel key="l" index={0} title="Operations">
          <LogsPanel />
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  pad: {padding: 16},
  mt: {marginTop: 16},
  label: {marginBottom: 6},
  cells: {flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1},
  cell: {width: '50%', paddingHorizontal: 16, paddingVertical: 12, gap: 4},
  inline: {flexDirection: 'row', alignItems: 'center', gap: 6},
  inlineWrap: {flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap'},
  inlineBetween: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8},
  inlineBetween0: {flexDirection: 'row', alignItems: 'center', gap: 8},
  dot: {width: 6, height: 6, borderRadius: 3},
  simBody: {padding: 16, gap: 12},
  start: {alignSelf: 'flex-start'},
  row2: {flexDirection: 'row', gap: 8},
  note: {flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12},
  listRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10},
  userCtl: {alignItems: 'flex-end', gap: 6, width: 110},
  dim: {opacity: 0.5},
  audit: {paddingVertical: 8, gap: 2},
});
