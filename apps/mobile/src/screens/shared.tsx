import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Bell, Bot, Search} from 'lucide-react-native';
import {useNotifications} from '../api/hooks';
import type {Signal} from '../api/types';
import {Txt} from '../components/Txt';
import {radius, usePalette} from '../theme';

export function HeaderIconButton({
  onPress,
  children,
  label,
  testID,
}: {
  onPress: () => void;
  children: React.ReactNode;
  label: string;
  testID?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({pressed}) => [styles.iconBtn, {backgroundColor: pressed ? p.raised : p.surface, borderColor: p.line}]}>
      {children}
    </Pressable>
  );
}

/** Unread count from the notification list (web Topbar bell badge). */
export function useUnreadCount(): number {
  const n = useNotifications();
  return (n.data ?? []).filter(x => !x.is_read).length;
}

/** Search (explorer), assistant and the notification bell with unread badge — the web Topbar on a phone. */
export function HeaderActions({search = true}: {search?: boolean}) {
  const p = usePalette();
  const nav = useNavigation();
  const unread = useUnreadCount();
  return (
    <View style={styles.row}>
      {search ? (
        <HeaderIconButton testID="open-explorer" label="Search stocks" onPress={() => nav.navigate('Explorer')}>
          <Search size={16} color={p.muted} />
        </HeaderIconButton>
      ) : null}
      <HeaderIconButton testID="open-assistant" label="AI assistant" onPress={() => nav.navigate('Assistant')}>
        <Bot size={16} color={p.muted} />
      </HeaderIconButton>
      <HeaderIconButton
        testID="open-notifications"
        label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onPress={() => nav.navigate('Notifications')}>
        <Bell size={16} color={p.muted} />
        {unread > 0 ? (
          <View testID="unread-badge" style={[styles.badge, {backgroundColor: p.accent, borderColor: p.surface}]}>
            <Txt variant="micro" num weight="600" color={p.ground} style={styles.badgeText}>
              {unread > 9 ? '9+' : String(unread)}
            </Txt>
          </View>
        ) : null}
      </HeaderIconButton>
    </View>
  );
}

export function actionTone(a: Signal['action']): 'up' | 'down' | 'neutral' {
  return a === 'BUY' ? 'up' : a === 'SELL' ? 'down' : 'neutral';
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: 8},
  iconBtn: {width: 34, height: 34, borderRadius: radius.ctl, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeText: {fontSize: 9, lineHeight: 11},
});
