import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {AlertTriangle, Inbox, RefreshCw} from 'lucide-react-native';
import {errorMessage} from '../api/client';
import {spacing, usePalette} from '../theme';
import {Button} from './Button';
import {Txt} from './Txt';

export interface EmptyStateProps {
  title: string;
  /** Web prop name is `body`; `message` kept for older call sites. */
  body?: string;
  message?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Web EmptyState: faint icon, 13px medium title, xs muted body, optional action. */
export function EmptyState({title, body, message, icon, actionLabel, onAction, action, style}: EmptyStateProps) {
  const p = usePalette();
  const text = body ?? message;
  return (
    <View testID="empty-state" style={[styles.wrap, style]}>
      {icon ?? <Inbox size={20} color={p.faint} />}
      <Txt variant="small" weight="500" align="center">
        {title}
      </Txt>
      {text ? (
        <Txt variant="caption" tone="muted" align="center" style={styles.msg}>
          {text}
        </Txt>
      ) : null}
      {action ? <View style={styles.btn}>{action}</View> : null}
      {actionLabel && onAction ? <Button title={actionLabel} size="sm" variant="primary" onPress={onAction} style={styles.btn} /> : null}
    </View>
  );
}

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

/** Web ErrorState: red triangle, "Could not load this", the message, ghost Retry. */
export function ErrorState({error, title = 'Could not load this', onRetry, style, compact}: ErrorStateProps) {
  const p = usePalette();
  return (
    <View testID="error-state" accessibilityRole="alert" style={[styles.wrap, compact && styles.compact, style]}>
      <AlertTriangle size={20} color={p.down} />
      <Txt variant="small" weight="500" align="center">
        {title}
      </Txt>
      <Txt variant="caption" tone="muted" align="center" style={styles.msg}>
        {error ? errorMessage(error) : 'Something went wrong.'}
      </Txt>
      {onRetry ? (
        <Button title="Retry" size="sm" variant="ghost" icon={<RefreshCw size={14} color={p.muted} />} onPress={onRetry} style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: spacing.xl, gap: 8},
  compact: {paddingVertical: spacing.lg},
  msg: {maxWidth: 320},
  btn: {marginTop: spacing.sm},
  retry: {marginTop: 4},
});
