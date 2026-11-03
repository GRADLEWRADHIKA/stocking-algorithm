import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {errorMessage} from '../../api/client';
import {Button, ServerAddressLink, TextField, Txt} from '../../components';
import {config} from '../../config';
import type {RootScreenProps} from '../../navigation/types';
import {useAuthStore} from '../../store/auth';
import {usePostLogin} from '../../store/postLogin';
import {alpha, radius, usePalette} from '../../theme';
import {isEmail} from '../../utils/validation';
import {AuthLayout} from './AuthLayout';

/** Local seed accounts — the same two the web login page fills in. */
export const ADMIN_ACCOUNT = {email: 'admin@quantdesk.local', password: 'Admin@12345'};

export function LoginScreen({navigation, route}: RootScreenProps<'Login'>) {
  const next = route.params?.next;
  const p = usePalette();
  const login = useAuthStore(s => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailErr = touched && !isEmail(email) ? 'Enter a valid email address' : null;
  const pwErr = touched && !password ? 'Enter your password' : null;

  const submit = async () => {
    setTouched(true);
    if (!isEmail(email) || !password) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // where to land once signed in (web /login?next=…); consumed by the root navigator
      usePostLogin.getState().set(next ?? null);
      await login(email, password);
    } catch (e) {
      usePostLogin.getState().set(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const fill = (admin: boolean) => {
    const acc = admin ? ADMIN_ACCOUNT : config.demoAccount;
    setEmail(acc.email);
    setPassword(acc.password);
    setError(null);
  };

  return (
    <AuthLayout back={navigation.canGoBack()} testID="login-screen" title="Log in" subtitle="Your paper portfolios, strategies and backtests.">
      <TextField
        testID="login-email"
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={emailErr}
      />
      <TextField
        testID="login-password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        error={pwErr}
        onSubmitEditing={submit}
      />
      {error ? (
        <View accessibilityRole="alert" style={[styles.err, {backgroundColor: alpha(p.down, 0.1)}]}>
          <Txt variant="caption" tone="down">
            {error}
          </Txt>
        </View>
      ) : null}
      <Button testID="login-submit" title="Log in" variant="primary" onPress={submit} loading={busy} size="lg" full />
      <View style={styles.links}>
        <Pressable onPress={() => navigation.navigate('ForgotPassword')} hitSlop={8} accessibilityRole="link">
          <Txt variant="caption" tone="muted">
            Forgot password?
          </Txt>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Register', next ? {next} : undefined)} hitSlop={8} accessibilityRole="link">
          <Txt variant="caption" tone="muted">
            Create an account
          </Txt>
        </Pressable>
      </View>
      <View style={[styles.demo, {borderColor: p.line}]}>
        <Txt variant="caption" tone="muted">
          Local demo accounts are created by the seed script.
        </Txt>
        <View style={styles.demoBtns}>
          <Button testID="login-demo" size="sm" title="Use demo account" onPress={() => fill(false)} />
          <Button testID="login-admin" size="sm" variant="ghost" title="Use admin" onPress={() => fill(true)} />
        </View>
      </View>
      <ServerAddressLink />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  err: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.ctl},
  links: {flexDirection: 'row', justifyContent: 'space-between'},
  demo: {borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 12, marginTop: 8},
  demoBtns: {flexDirection: 'row', gap: 8},
});
