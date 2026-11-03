import React, {useState} from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {Plus} from 'lucide-react-native';
import {useActiveAccount, useCreateAccount} from '../../api/hooks';
import {errorMessage} from '../../api/client';
import {usePalette} from '../../theme';
import {Button} from '../Button';
import {SelectField} from '../SelectField';
import {Sheet} from '../Sheet';
import {TextField} from '../TextField';
import {toast} from '../Toast';

/** Paper account picker (web AccountSwitcher). Hidden when there are no accounts. */
export function AccountSwitcher({style}: {style?: StyleProp<ViewStyle>}) {
  const {accounts, active, setAccountId} = useActiveAccount();
  if (!accounts.length || !active) {
    return null;
  }
  return (
    <SelectField
      testID="account-switcher"
      size="sm"
      accessibilityLabel="Paper account"
      title="Paper account"
      value={String(active.id)}
      options={accounts.map(a => ({value: String(a.id), label: a.name}))}
      onChange={v => setAccountId(Number(v))}
      style={[styles.switcher, style]}
    />
  );
}

/** Validation mirroring the web schema: name 2–60 chars, capital ₹10,000 – ₹1e10. */
export function validateNewAccount(name: string, capital: string): {name?: string; capital?: string} {
  const errs: {name?: string; capital?: string} = {};
  const n = name.trim();
  if (n.length < 2) {
    errs.name = 'Name it';
  } else if (n.length > 60) {
    errs.name = 'At most 60 characters';
  }
  const c = Number(capital.replace(/,/g, ''));
  if (!capital.trim() || !Number.isFinite(c) || c < 10000) {
    errs.capital = 'Minimum ₹10,000';
  } else if (c > 1e10) {
    errs.capital = 'Too large';
  }
  return errs;
}

/** "New account" button + sheet (web NewAccountButton dialog). */
export function NewAccountButton({variant = 'secondary'}: {variant?: 'secondary' | 'primary'}) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Swing book');
  const [capital, setCapital] = useState('1000000');
  const [tried, setTried] = useState(false);
  const create = useCreateAccount();
  const errs = tried ? validateNewAccount(name, capital) : {};
  const submit = () => {
    setTried(true);
    const e = validateNewAccount(name, capital);
    if (e.name || e.capital) {
      return;
    }
    create.mutate(
      {name: name.trim(), initial_capital: Number(capital.replace(/,/g, ''))},
      {
        onSuccess: a => {
          setOpen(false);
          setTried(false);
          toast.success(`${a.name} created`);
        },
        onError: err => toast.error(errorMessage(err)),
      },
    );
  };
  return (
    <>
      <Button
        testID="new-account"
        size="sm"
        variant={variant}
        title="New account"
        icon={<Plus size={14} color={variant === 'primary' ? p.ground : p.ink} />}
        onPress={() => setOpen(true)}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="New paper account"
        description="Virtual capital for simulated trading. No real money is involved."
        testID="new-account-sheet">
        <View style={styles.form}>
          <TextField label="Name" value={name} onChangeText={setName} error={errs.name} />
          <TextField
            label="Virtual starting capital ₹"
            value={capital}
            onChangeText={setCapital}
            keyboardType="numeric"
            error={errs.capital}
          />
          <Button title="Create account" variant="primary" size="lg" full loading={create.isPending} onPress={submit} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  switcher: {minWidth: 140},
  form: {gap: 12},
});
