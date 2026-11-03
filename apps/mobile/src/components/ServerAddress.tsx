import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {DEFAULT_BASE_URL, normalizeBaseUrl} from '../config';
import {probeServer, useServerStore} from '../store/server';
import {usePalette} from '../theme';
import {Button} from './Button';
import {Sheet} from './Sheet';
import {TextField} from './TextField';
import {Txt} from './Txt';

/**
 * Where the app finds the QuantDesk backend. On a phone this is the computer's LAN address
 * (the backend started with --host 0.0.0.0); the emulator default is 10.0.2.2.
 */
export function ServerAddressSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const p = usePalette();
  const qc = useQueryClient();
  const {url, setUrl, reset} = useServerStore();
  const [value, setValue] = useState(url);
  const [result, setResult] = useState<{ok: boolean; message: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const normalized = normalizeBaseUrl(value);

  const test = async () => {
    if (!normalized) {
      return;
    }
    setBusy(true);
    setResult(await probeServer(normalized));
    setBusy(false);
  };
  const save = () => {
    if (setUrl(value)) {
      qc.clear(); // every cached figure came from the old server
      setResult(null);
      onClose();
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Server address" description="The QuantDesk backend this app talks to." testID="server-sheet">
      <View style={styles.body}>
        <TextField
          testID="server-input"
          label="Address"
          value={value}
          onChangeText={t => {
            setValue(t);
            setResult(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="192.168.1.20:8000"
          error={value && !normalized ? 'Enter an IP or host name, for example 192.168.1.20:8000' : null}
          hint={normalized && normalized !== value ? `Will use ${normalized}` : 'On a phone, use your computer’s Wi-Fi IP address.'}
        />
        {result ? (
          <Txt testID="server-result" variant="small" color={result.ok ? p.up : p.down}>
            {result.message}
          </Txt>
        ) : null}
        <View style={styles.row}>
          <Button testID="server-test" title="Test connection" onPress={test} loading={busy} disabled={!normalized} style={styles.flex} />
          <Button testID="server-save" title="Save" variant="primary" onPress={save} disabled={!normalized} style={styles.flex} />
        </View>
        <Txt variant="caption" tone="muted">
          On the computer, start the backend with --host 0.0.0.0 so the phone can reach it, and keep both on the same network.
        </Txt>
        {url !== DEFAULT_BASE_URL ? (
          <Pressable
            onPress={() => {
              reset();
              qc.clear();
              setValue(DEFAULT_BASE_URL);
            }}
            accessibilityRole="button">
            <Txt variant="small" tone="muted">
              Reset to the emulator default ({DEFAULT_BASE_URL})
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

/** One-line "Server · 192.168.1.20:8000 · Change" link that opens the sheet. */
export function ServerAddressLink() {
  const url = useServerStore(s => s.url);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable testID="server-link" onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Server ${url}. Change`} style={styles.link}>
        <Txt variant="caption" tone="muted" num>
          Server · {url.replace(/^https?:\/\//, '')}
        </Txt>
        <Txt variant="caption" tone="accent">
          Change
        </Txt>
      </Pressable>
      <ServerAddressSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  body: {gap: 14},
  row: {flexDirection: 'row', gap: 8},
  flex: {flex: 1},
  link: {flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'center', paddingVertical: 8},
});
