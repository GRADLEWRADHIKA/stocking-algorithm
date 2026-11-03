import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {
  Activity,
  BellRing,
  Bot,
  ChevronRight,
  FlaskConical,
  ListChecks,
  LogOut,
  Search,
  Shield,
  Star,
  Workflow,
  type LucideIcon,
} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {useUpdatePreferences, useUpdateProfile} from '../api/hooks';
import type {Timeframe, UserPreferences} from '../api/types';
import {Badge, Button, KV, Panel, Screen, Segmented, SelectField, ServerAddressLink, TextField, Txt, Wordmark, toast} from '../components';
import {config} from '../config';
import {useLive} from '../hooks/useLiveQuotes';
import type {RootStackParamList, TabScreenProps} from '../navigation/types';
import {useAuthStore} from '../store/auth';
import {useThemeStore} from '../store/theme';
import {usePalette} from '../theme';
import {dateTime} from '../utils/fmt';

type Link = {label: string; icon: LucideIcon; route: keyof RootStackParamList; testID: string};

/** Everything the web sidebar reaches that is not a bottom tab. */
const LINKS: Link[] = [
  {label: 'Stock Explorer', icon: Search, route: 'Explorer', testID: 'open-explorer-link'},
  {label: 'Strategies', icon: Workflow, route: 'StrategyBuilder', testID: 'open-strategies'},
  {label: 'Backtesting', icon: FlaskConical, route: 'Backtesting', testID: 'open-backtesting'},
  {label: 'Signals', icon: Activity, route: 'Signals', testID: 'open-signals'},
  {label: 'Paper Trading', icon: ListChecks, route: 'PaperTrading', testID: 'open-paper'},
  {label: 'AI Assistant', icon: Bot, route: 'Assistant', testID: 'open-assistant-link'},
  {label: 'Notifications', icon: BellRing, route: 'Notifications', testID: 'open-notifications-link'},
  {label: 'Alerts', icon: Star, route: 'Alerts', testID: 'open-alerts'},
];

const WS_LABEL = {idle: 'Not connected', connecting: 'Connecting…', open: 'Live', reconnecting: 'Reconnecting…'} as const;

function NavRow({l, first}: {l: Link; first: boolean}) {
  const p = usePalette();
  const nav = useNavigation();
  const Icon = l.icon;
  return (
    <Pressable
      testID={l.testID}
      accessibilityRole="button"
      accessibilityLabel={l.label}
      onPress={() => (nav.navigate as (r: string) => void)(l.route)}
      style={({pressed}) => [styles.navRow, !first && {borderTopWidth: 1, borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
      <Icon size={16} color={p.muted} />
      <Txt variant="small" style={styles.flex}>
        {l.label}
      </Txt>
      <ChevronRight size={14} color={p.faint} />
    </Pressable>
  );
}

export function ProfileScreen(_props: TabScreenProps<'Profile'>) {
  const p = usePalette();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const mode = useThemeStore(s => s.mode);
  const setMode = useThemeStore(s => s.setMode);
  const wsStatus = useLive(s => s.status);
  const profile = useUpdateProfile();
  const prefs = useUpdatePreferences();
  const [name, setName] = useState(user?.full_name ?? '');
  const pr = user?.preferences;
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => setName(user?.full_name ?? ''), [user?.full_name]);

  const savePref = (patch: Partial<UserPreferences>) =>
    prefs.mutate(patch, {onSuccess: () => toast.success('Preference saved'), onError: e => toast.error((e as Error).message)});

  const links = isAdmin
    ? [...LINKS, {label: 'Admin', icon: Shield, route: 'Admin' as const, testID: 'open-admin'}]
    : LINKS;

  return (
    <Screen testID="profile-screen" title="Settings" subtitle="Profile, preferences and how this installation is configured." keyboard>
      <View style={styles.brand}>
        <Wordmark />
        <Badge label={isAdmin ? 'Administrator' : 'User'} tone={isAdmin ? 'accent' : 'neutral'} />
      </View>

      <Panel index={0} title="Go to">
        {links.map((l, i) => (
          <NavRow key={l.route} l={l} first={i === 0} />
        ))}
      </Panel>

      <Panel index={1} title="Profile" padded bodyStyle={styles.gap}>
        <TextField label="Email" value={user?.email ?? ''} editable={false} />
        <TextField testID="profile-name" label="Full name" value={name} onChangeText={setName} maxLength={80} />
        <View style={styles.between}>
          <Txt variant="caption" tone="muted" style={styles.flex}>
            {isAdmin ? 'Administrator' : 'User'} · joined {dateTime(user?.created_at, false)}
          </Txt>
          <Button
            testID="profile-save"
            size="sm"
            variant="primary"
            title="Save"
            loading={profile.isPending}
            disabled={!name.trim() || name === user?.full_name}
            onPress={() =>
              profile.mutate(
                {full_name: name.trim()},
                {onSuccess: () => toast.success('Profile updated'), onError: e => toast.error((e as Error).message)},
              )
            }
          />
        </View>
      </Panel>

      <Panel index={2} title="Preferences" padded bodyStyle={styles.gap}>
        <View style={styles.between}>
          <Txt variant="small">Theme</Txt>
          <Segmented
            testID="theme"
            value={mode}
            onChange={t => {
              setMode(t);
              savePref({theme: t});
            }}
            options={[
              {value: 'dark', label: 'Dark'},
              {value: 'light', label: 'Light'},
            ]}
          />
        </View>
        <SelectField
          testID="pref-timeframe"
          label="Default chart timeframe"
          value={pr?.default_timeframe ?? '1d'}
          onChange={v => savePref({default_timeframe: v as Timeframe})}
          options={(['5m', '15m', '1h', '1d', '1w'] as Timeframe[]).map(t => ({value: t, label: t}))}
          num
        />
        <SelectField
          testID="pref-exchange"
          label="Default exchange"
          value={pr?.default_exchange ?? 'NSE'}
          onChange={v => savePref({default_exchange: v})}
          options={[
            {value: 'NSE', label: 'NSE'},
            {value: 'BSE', label: 'BSE'},
          ]}
        />
        <Button testID="reset-chart" size="sm" variant="ghost" title="Reset saved chart layout" onPress={() => savePref({chart_config: {}})} style={styles.start} />
      </Panel>

      <Panel index={3} title="Data and connectivity" padded>
        <KV first k="API endpoint" v={config.apiUrl} />
        <ServerAddressLink />
        <KV k="Live feed" v={WS_LABEL[wsStatus]} color={wsStatus === 'open' ? p.up : p.muted} />
        <KV k="Market data" v="Local simulator and imported CSV datasets" />
        <KV k="AI assistant" v="Rule-based, runs in the local backend" />
        <KV k="Broker connection" v="None. Paper trading only" />
        <KV k="Third-party API keys" v="None required or stored" />
        <KV k="Real-time exchange data" v="Not used. Prices are never live NSE/BSE quotes" />
        <View style={styles.badges}>
          <Badge label="Simulated data" tone="warn" />
          <Badge label="Historical dataset" tone="info" />
          <Badge label="Paper trading" tone="accent" />
        </View>
        <Txt variant="caption" tone="muted" style={styles.note}>
          These labels mark the source of every figure in the app.
        </Txt>
        <Txt variant="micro" tone="faint" style={styles.note}>
          App version {config.appVersion}
        </Txt>
      </Panel>

      <Button testID="logout" title="Log out" variant="danger" icon={<LogOut size={14} color={p.down} />} onPress={() => logout()} full />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  brand: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  gap: {gap: 12},
  between: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  start: {alignSelf: 'flex-start'},
  navRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 46},
  badges: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12},
  note: {marginTop: 6},
});
