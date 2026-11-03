import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNotificationMutations, useNotifications} from '../api/hooks';
import type {Notification} from '../api/types';
import {Badge, Button, ErrorState, Panel, Screen, SkeletonRows, Txt} from '../components';
import type {BadgeTone} from '../components/Badge';
import type {RootScreenProps} from '../navigation/types';
import {alpha, usePalette} from '../theme';
import {relative} from '../utils/fmt';

const KIND_TONE: Record<Notification['kind'], BadgeTone> = {ALERT: 'warn', ORDER: 'accent', SIGNAL: 'info', SYSTEM: 'neutral'};

/** Web Topbar notification popover as a screen: unread dot, title, body, relative time, mark read. */
export function NotificationsScreen({navigation}: RootScreenProps<'Notifications'>) {
  const p = usePalette();
  const q = useNotifications();
  const {read, readAll} = useNotificationMutations();
  const list = q.data ?? [];
  const unread = list.filter(n => !n.is_read).length;
  return (
    <Screen
      back
      title="Notifications"
      subtitle={unread ? `${unread} unread` : 'All caught up'}
      testID="notifications-screen"
      refreshing={q.isRefetching}
      onRefresh={q.refetch}
      right={
        unread > 0 ? (
          <Button testID="mark-all-read" size="sm" variant="ghost" title="Mark all read" loading={readAll.isPending} onPress={() => readAll.mutate()} />
        ) : null
      }>
      <Panel index={0}>
        {q.isLoading ? (
          <SkeletonRows rows={6} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : list.length === 0 ? (
          <Txt variant="caption" tone="muted" align="center" style={styles.empty}>
            No notifications yet. Alerts and order fills appear here.
          </Txt>
        ) : (
          list.map((n, i) => (
            <Pressable
              key={n.id}
              testID={`notification-${n.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${n.is_read ? '' : 'Unread. '}${n.title}. ${n.body}`}
              accessibilityHint={n.is_read ? undefined : 'Marks as read'}
              onPress={() => !n.is_read && read.mutate(n.id)}
              style={({pressed}) => [
                styles.row,
                i > 0 && {borderTopWidth: 1, borderTopColor: p.rule},
                pressed && {backgroundColor: alpha(p.raised, 0.6)},
              ]}>
              <View style={[styles.dot, {backgroundColor: n.is_read ? 'transparent' : p.accent}]} />
              <View style={styles.flex}>
                <View style={styles.titleRow}>
                  <Txt variant="small" style={styles.flex}>
                    {n.title}
                  </Txt>
                  <Txt variant="micro" tone="faint">
                    {relative(n.created_at)}
                  </Txt>
                </View>
                <Txt variant="caption" tone="muted">
                  {n.body}
                </Txt>
                <Badge label={n.kind.toLowerCase()} tone={KIND_TONE[n.kind]} style={styles.kind} />
              </View>
            </Pressable>
          ))
        )}
        <View style={[styles.foot, {borderTopColor: p.rule}]}>
          <Pressable onPress={() => navigation.navigate('Alerts')} hitSlop={8} accessibilityRole="link">
            <Txt variant="caption" tone="muted">
              Manage alerts
            </Txt>
          </Pressable>
        </View>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  empty: {paddingHorizontal: 16, paddingVertical: 32},
  row: {flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12},
  dot: {width: 6, height: 6, borderRadius: 3, marginTop: 7},
  titleRow: {flexDirection: 'row', gap: 8, alignItems: 'flex-start'},
  kind: {marginTop: 6},
  foot: {borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'flex-end'},
});
