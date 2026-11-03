import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {errorMessage} from '../../api/client';
import {Button, TextField, Txt} from '../../components';
import {usePostLogin} from '../../store/postLogin';
import type {RootScreenProps} from '../../navigation/types';
import {useAuthStore} from '../../store/auth';
import {alpha, radius, usePalette} from '../../theme';
import {isEmail} from '../../utils/validation';
import {AuthLayout} from './AuthLayout';

/** Same rules and messages as web lib/schemas.ts registerSchema. */
export function passwordRule(v: string): string | null {
  if (v.length < 8) {
    return 'At least 8 characters';
  }
  if (!/[A-Za-z]/.test(v)) {
    return 'Include a letter';
  }
  if (!/[0-9]/.test(v)) {
    return 'Include a number';
  }
  return null;
}

export function RegisterScreen({navigation, route}: RootScreenProps<'Register'>) {
  const next = route.params?.next;
  const p = usePalette();
  const register = useAuthStore(s => s.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errs = {
    name: name.trim().length < 2 ? 'Enter your name' : null,
    email: !isEmail(email) ? 'Enter a valid email address' : null,
    password: passwordRule(password),
    confirm: confirm !== password ? 'Passwords do not match' : null,
  };
  const valid = !Object.values(errs).some(Boolean);

  const submit = async () => {
    setTouched(true);
    if (!valid) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      usePostLogin.getState().set(next ?? null);
      await register(email, password, name);
    } catch (e) {
      usePostLogin.getState().set(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout testID="register-screen" back title="Create an account" subtitle="Stored in your local database only.">
      <TextField testID="register-name" label="Full name" value={name} onChangeText={setName} autoComplete="name" maxLength={80} error={touched ? errs.name : null} />
      <TextField
        testID="register-email"
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        error={touched ? errs.email : null}
      />
      <TextField
        testID="register-password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        hint="8+ characters with a letter and a number"
        error={touched ? errs.password : null}
      />
      <TextField
        testID="register-confirm"
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        error={touched ? errs.confirm : null}
        onSubmitEditing={submit}
      />
      {error ? (
        <View accessibilityRole="alert" style={[styles.err, {backgroundColor: alpha(p.down, 0.1)}]}>
          <Txt variant="caption" tone="down">
            {error}
          </Txt>
        </View>
      ) : null}
      <Button testID="register-submit" title="Create account" variant="primary" size="lg" full loading={busy} onPress={submit} />
      <View style={styles.row}>
        <Txt variant="caption" tone="muted">
          Already registered?{' '}
        </Txt>
        <Pressable onPress={() => navigation.navigate('Login', next ? {next} : undefined)} hitSlop={8} accessibilityRole="link">
          <Txt variant="caption">Log in</Txt>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  err: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.ctl},
  row: {flexDirection: 'row', alignItems: 'center'},
});
