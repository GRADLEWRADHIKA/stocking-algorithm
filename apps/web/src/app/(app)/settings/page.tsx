'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { useUpdatePreferences, useUpdateProfile } from '@/hooks/queries';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Segmented } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { API_URL } from '@/lib/config';
import { dateTime } from '@/lib/format';
import type { Timeframe } from '@shared/types/api';

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const { theme, setTheme } = useUi();
  const profile = useUpdateProfile();
  const prefs = useUpdatePreferences();
  const [name, setName] = useState(user?.full_name ?? '');
  const p = user?.preferences;

  const savePref = (patch: Parameters<typeof prefs.mutate>[0]) =>
    prefs.mutate(patch, { onSuccess: () => toast.success('Preference saved'), onError: (e) => toast.error(e.message) });

  return (
    <Page className="max-w-[1100px]">
      <PageHeader title="Settings" sub="Profile, preferences and how this installation is configured." />
      <Stagger className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profile" bodyClassName="p-4 space-y-3">
          <Field label="Email">
            <Input value={user?.email ?? ''} disabled />
          </Field>
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {user?.role === 'ADMIN' ? 'Administrator' : 'User'} · joined {dateTime(user?.created_at, false)}
            </span>
            <Button
              size="sm"
              variant="primary"
              loading={profile.isPending}
              disabled={!name.trim() || name === user?.full_name}
              onClick={() => profile.mutate({ full_name: name.trim() }, { onSuccess: () => toast.success('Profile updated'), onError: (e) => toast.error(e.message) })}
            >
              Save
            </Button>
          </div>
        </Panel>
        <Panel title="Preferences" bodyClassName="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px]">Theme</span>
            <Segmented
              value={theme}
              onChange={(t) => {
                setTheme(t);
                savePref({ theme: t });
              }}
              items={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
          <Field label="Default chart timeframe">
            <Select value={p?.default_timeframe ?? '1d'} onChange={(e) => savePref({ default_timeframe: e.target.value as Timeframe })}>
              {(['5m', '15m', '1h', '1d', '1w'] as Timeframe[]).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Default exchange">
            <Select value={p?.default_exchange ?? 'NSE'} onChange={(e) => savePref({ default_exchange: e.target.value as 'NSE' | 'BSE' })}>
              <option>NSE</option>
              <option>BSE</option>
            </Select>
          </Field>
          <Button size="sm" variant="ghost" onClick={() => savePref({ chart_config: {} })}>
            Reset saved chart layout
          </Button>
        </Panel>
        <Panel title="Data and connectivity" className="lg:col-span-2" bodyClassName="p-4">
          <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
            {[
              ['API endpoint', API_URL],
              ['Market data', 'Local simulator and imported CSV datasets'],
              ['AI assistant', 'Rule-based, runs in the local backend'],
              ['Broker connection', 'None. Paper trading only'],
              ['Third-party API keys', 'None required or stored'],
              ['Real-time exchange data', 'Not used. Prices are never live NSE/BSE quotes'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-t border-rule py-2">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="warn">Simulated data</Badge>
            <Badge tone="info">Historical dataset</Badge>
            <Badge tone="accent">Paper trading</Badge>
            <span className="text-xs text-muted">These labels mark the source of every figure in the app.</span>
          </div>
        </Panel>
      </Stagger>
    </Page>
  );
}
