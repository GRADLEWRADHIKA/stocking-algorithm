import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {FadeInRight} from 'react-native-reanimated';
import {errorMessage} from '../../api/client';
import {api} from '../../api/endpoints';
import {Button, TextField, Txt} from '../../components';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import type {RootScreenProps} from '../../navigation/types';
import {isEmail} from '../../utils/validation';
import {AuthLayout} from './AuthLayout';
import {passwordRule} from './RegisterScreen';

/**
 * Web forgot-password flow: request a token (the backend returns `dev_reset_token` in development,
 * since there is no email server locally), then set a new password with it.
 */
export function ForgotPasswordScreen({navigation}: RootScreenProps<'ForgotPassword'>) {
  const reduce = useReduceMotion();
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [devToken, setDevToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const request = async () => {
    setTouched(true);
    if (!isEmail(email)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.requestReset(email.trim());
      setDevToken(res.dev_reset_token ?? null);
      if (res.dev_reset_token) {
        setToken(res.dev_reset_token);
      }
      setTouched(false);
      setStep('confirm');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const errs = {
    token: token.trim().length < 10 ? 'Paste the reset token' : null,
    password: passwordRule(password),
    confirm: confirm !== password ? 'Passwords do not match' : null,
  };

  const submit = async () => {
    setTouched(true);
    if (Object.values(errs).some(Boolean)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.confirmReset(token.trim(), password);
      setStep('done');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const enter = reduce ? undefined : FadeInRight.duration(260);

  return (
    <AuthLayout testID="forgot-screen" back title="Reset password">
      {step === 'request' ? (
        <Animated.View key="r" entering={enter} style={styles.step}>
          <Txt variant="small" tone="muted">
            There is no email server in local development. In development mode the reset token is shown here instead.
          </Txt>
          <TextField
            testID="forgot-email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            error={touched && !isEmail(email) ? 'Enter a valid email address' : null}
            onSubmitEditing={request}
          />
          {error ? (
            <Txt variant="caption" tone="down">
              {error}
            </Txt>
          ) : null}
          <Button testID="forgot-request" title="Request reset token" variant="primary" full loading={busy} onPress={request} />
        </Animated.View>
      ) : step === 'confirm' ? (
        <Animated.View key="c" entering={enter} style={styles.step}>
          <Txt variant="small" tone="muted">
            {devToken ? 'Development token filled in below. It expires shortly.' : 'If the account exists, a reset token was issued. Paste it below.'}
          </Txt>
          <TextField
            testID="forgot-token"
            label="Reset token"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            num
            style={styles.token}
            error={touched ? errs.token : null}
          />
          <TextField
            testID="forgot-password"
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            error={touched ? errs.password : null}
          />
          <TextField
            testID="forgot-confirm"
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            error={touched ? errs.confirm : null}
            onSubmitEditing={submit}
          />
          {error ? (
            <Txt variant="caption" tone="down">
              {error}
            </Txt>
          ) : null}
          <Button testID="forgot-submit" title="Set new password" variant="primary" full loading={busy} onPress={submit} />
        </Animated.View>
      ) : (
        <Animated.View key="d" entering={enter} style={styles.step}>
          <Txt variant="small" tone="up">
            Password updated. Existing sessions were signed out.
          </Txt>
          <Button title="Back to log in" variant="primary" full onPress={() => navigation.navigate('Login')} />
        </Animated.View>
      )}
      <View>
        <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8} accessibilityRole="link">
          <Txt variant="caption" tone="muted">
            ← Back to log in
          </Txt>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  step: {gap: 14},
  token: {fontSize: 12},
});
