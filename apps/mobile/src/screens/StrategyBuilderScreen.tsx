import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import Animated, {FadeIn, FadeOut} from 'react-native-reanimated';
import {CheckCircle2, Copy, FlaskConical, Pencil, Play, Plus, Save, ScanSearch, Trash2, XCircle} from 'lucide-react-native';
import {
  useBuiltinStrategies,
  useEvaluateStrategy,
  useIndicatorCatalog,
  useSavedStrategies,
  useScreen,
  useStrategyMutations,
  useValidateStrategy,
} from '../api/hooks';
import {ApiError} from '../api/client';
import type {StrategyDefinition, Timeframe} from '../api/types';
import {Button} from '../components/Button';
import {HeadLink, Panel} from '../components/Panel';
import {Screen} from '../components/Screen';
import {SelectField} from '../components/SelectField';
import {SignalCard} from '../components/SignalCard';
import {SkeletonRows} from '../components/Skeleton';
import {EmptyState} from '../components/States';
import {Tabs} from '../components/Tabs';
import {TextField} from '../components/TextField';
import {toast} from '../components/Toast';
import {Txt} from '../components/Txt';
import {NumInput, RuleGroupEditor} from '../components/strategy/RuleEditor';
import {SymbolPicker} from '../components/strategy/SymbolPicker';
import {useReduceMotion} from '../hooks/useReduceMotion';
import type {RootScreenProps} from '../navigation/types';
import {alpha, changeColor, radius, usePalette} from '../theme';
import {pct, price, relative} from '../utils/fmt';
import {DEFAULT_DEFINITION, conditionText, definitionSentence, localErrors} from '../utils/rules';

const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '1d', '1w'];

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.errors?.length) {
    return e.errors.join('\n');
  }
  return (e as Error)?.message ?? 'Something went wrong.';
}

export function StrategyBuilderScreen({navigation, route}: RootScreenProps<'StrategyBuilder'>) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const catalog = useIndicatorCatalog();
  const builtin = useBuiltinStrategies();
  const saved = useSavedStrategies();
  const m = useStrategyMutations();
  const validate = useValidateStrategy();
  const evaluate = useEvaluateStrategy();
  const screen = useScreen();
  const scrollRef = useRef<ScrollView>(null);
  const screenMode = route.params?.mode === 'screen';

  const [list, setList] = useState<'mine' | 'builtin'>('mine');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('EMA trend with RSI and volume');
  const [description, setDescription] = useState('Long when the short EMA leads, momentum is positive and volume confirms.');
  const [def, setDef] = useState<StrategyDefinition>(DEFAULT_DEFINITION);
  const [testSymbol, setTestSymbol] = useState('RELIANCE');
  const [serverCheck, setServerCheck] = useState<{valid: boolean; errors: string[]} | null>(null);

  const cat = useMemo(() => catalog.data ?? [], [catalog.data]);
  const local = useMemo(() => (catalog.data ? localErrors(def, catalog.data) : []), [def, catalog.data]);
  const sentence = useMemo(() => definitionSentence(def, cat), [def, cat]);
  useEffect(() => setServerCheck(null), [def]);

  const load = (id: number) => {
    const s = saved.data?.find(x => x.id === id);
    if (!s) {
      return;
    }
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description);
    setDef(s.definition);
    evaluate.reset();
    scrollRef.current?.scrollTo?.({y: 0, animated: !reduce});
  };

  // Deep link: StrategyBuilder {editId}
  const editId = route.params?.editId;
  useEffect(() => {
    if (editId && saved.data && editingId !== editId) {
      load(editId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, saved.data]);

  const reset = () => {
    setEditingId(null);
    setName('Untitled strategy');
    setDescription('');
    setDef(DEFAULT_DEFINITION);
    evaluate.reset();
  };

  const onSave = () => {
    if (local.length) {
      toast.error('Fix the highlighted problems first');
      return;
    }
    m.save.mutate(
      {id: editingId ?? undefined, name: name.trim() || 'Untitled strategy', description, definition: def},
      {
        onSuccess: s => {
          setEditingId(s.id);
          toast.success(editingId ? 'Strategy updated' : 'Strategy saved');
        },
        onError: e => {
          if (e instanceof ApiError && e.errors?.length) {
            setServerCheck({valid: false, errors: e.errors});
          }
          toast.error('Not saved', {description: errorText(e)});
        },
      },
    );
  };

  const confirmDelete = (id: number, sname: string) =>
    Alert.alert(`Delete “${sname}”?`, 'Backtests that used it keep their results.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          m.remove.mutate(id, {
            onSuccess: () => {
              if (editingId === id) {
                reset();
              }
              toast.success('Strategy deleted');
            },
            onError: e => toast.error(errorText(e)),
          }),
      },
    ]);

  const ready = !!catalog.data && !local.length;
  const setRisk = (k: 'stop_loss_pct' | 'take_profit_pct' | 'position_size_pct', v: number) =>
    setDef({...def, risk: {...def.risk, [k]: Number.isNaN(v) ? (k === 'position_size_pct' ? 0 : null) : v}});

  return (
    <Screen
      back
      title="Strategy builder"
      subtitle="Rules are checked by a safe rule engine, never run as code"
      keyboard
      scroll={false}
      testID="strategy-builder-screen"
      right={<Button title="New" size="sm" icon={<Plus size={14} color={p.ink} />} onPress={reset} testID="strategy-new" />}>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Txt variant="caption" tone="muted">
          Compose entry and exit rules from indicators. Rules are validated and evaluated by a safe rule engine on the server, never as code.
        </Txt>
        {screenMode ? (
          <View style={[styles.note, {borderColor: alpha(p.accent, 0.4), backgroundColor: alpha(p.accent, 0.08)}]}>
            <Txt variant="caption">Custom screen: set the entry rules below, then tap “Run entry rules as a screen”.</Txt>
          </View>
        ) : null}

        <Panel
          index={0}
          title={editingId ? `Editing · ${name}` : 'New strategy'}
          action={
            <>
              <Button
                title="Validate"
                size="sm"
                variant="ghost"
                disabled={!ready}
                loading={validate.isPending}
                onPress={() => validate.mutate(def, {onSuccess: setServerCheck, onError: e => toast.error(errorText(e))})}
                testID="strategy-validate"
              />
              <Button
                title={editingId ? 'Update' : 'Save'}
                size="sm"
                variant="primary"
                icon={<Save size={14} color={p.ground} />}
                disabled={!ready}
                loading={m.save.isPending}
                onPress={onSave}
                testID="strategy-save"
              />
            </>
          }
          bodyStyle={styles.body}>
          {!catalog.data ? (
            <SkeletonRows rows={8} />
          ) : (
            <>
              <TextField label="Name" value={name} onChangeText={setName} maxLength={80} />
              <TextField label="Description" value={description} onChangeText={setDescription} maxLength={240} />
              <SelectField
                label="Timeframe"
                num
                value={def.timeframe}
                options={TIMEFRAMES.map(t => ({value: t, label: t}))}
                onChange={t => setDef({...def, timeframe: t})}
              />
              <RuleGroupEditor
                testID="entry-group"
                title="Entry: generate BUY when"
                tone="up"
                group={def.entry}
                catalog={cat}
                onChange={entry => setDef({...def, entry})}
              />
              <RuleGroupEditor
                testID="exit-group"
                title="Exit: close the position when"
                tone="down"
                group={def.exit}
                catalog={cat}
                onChange={exit => setDef({...def, exit})}
              />
              <View>
                <Txt variant="title" style={styles.mb8}>
                  Risk
                </Txt>
                <View style={styles.riskRow}>
                  <View style={styles.flex}>
                    <NumInput label="Stop-loss %" hint="Exit if price falls this far below entry" value={def.risk.stop_loss_pct} onChange={v => setRisk('stop_loss_pct', v)} />
                  </View>
                  <View style={styles.flex}>
                    <NumInput label="Target %" hint="Exit if price rises this far above entry" value={def.risk.take_profit_pct} onChange={v => setRisk('take_profit_pct', v)} />
                  </View>
                  <View style={styles.flex}>
                    <NumInput
                      label="Position size % of equity"
                      hint="Capital committed per trade"
                      value={def.risk.position_size_pct}
                      onChange={v => setRisk('position_size_pct', v)}
                    />
                  </View>
                </View>
              </View>

              <View testID="reads-as" style={[styles.reads, {backgroundColor: p.ground, borderColor: p.line}]}>
                <Txt variant="caption" tone="muted" style={styles.mb8}>
                  Reads as
                </Txt>
                <Txt variant="small">
                  <Txt variant="small" weight="600" tone="up">
                    BUY
                  </Txt>
                  {sentence.buy.slice(3)}
                </Txt>
                <Txt variant="small" style={styles.mt4}>
                  <Txt variant="small" weight="600" tone="down">
                    EXIT
                  </Txt>
                  {sentence.exit.slice(4)}
                </Txt>
                {local.length > 0 || serverCheck ? (
                  <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} style={styles.errs}>
                    {local.map(e => (
                      <View key={e} style={styles.errRow}>
                        <XCircle size={14} color={p.down} style={styles.icon} />
                        <Txt variant="caption" tone="down" style={styles.flex}>
                          {e}
                        </Txt>
                      </View>
                    ))}
                    {!local.length && serverCheck?.valid ? (
                      <View style={styles.errRow}>
                        <CheckCircle2 size={14} color={p.up} style={styles.icon} />
                        <Txt variant="caption" tone="up" style={styles.flex}>
                          The rule engine accepted this definition.
                        </Txt>
                      </View>
                    ) : null}
                    {!local.length
                      ? serverCheck?.errors.map(e => (
                          <View key={e} style={styles.errRow}>
                            <XCircle size={14} color={p.down} style={styles.icon} />
                            <Txt variant="caption" tone="down" style={styles.flex}>
                              {e}
                            </Txt>
                          </View>
                        ))
                      : null}
                  </Animated.View>
                ) : null}
              </View>

              <View style={[styles.test, {borderTopColor: p.rule}]}>
                <SymbolPicker label="Test on" value={testSymbol} onPick={setTestSymbol} testID="strategy-test-symbol" />
                <Button
                  title={`Evaluate ${testSymbol} now`}
                  icon={<Play size={14} color={p.ink} />}
                  disabled={!ready}
                  loading={evaluate.isPending}
                  onPress={() =>
                    evaluate.mutate({definition: def, symbol: testSymbol, timeframe: def.timeframe}, {onError: e => toast.error(errorText(e))})
                  }
                />
                <Button
                  title="Run entry rules as a screen"
                  variant={screenMode ? 'primary' : 'ghost'}
                  icon={<ScanSearch size={14} color={screenMode ? p.ground : p.muted} />}
                  disabled={!ready}
                  loading={screen.isPending}
                  onPress={() =>
                    screen.mutate(
                      {logic: def.entry.logic, conditions: def.entry.conditions, timeframe: def.timeframe},
                      {onError: e => toast.error(errorText(e))},
                    )
                  }
                  testID="strategy-run-screen"
                />
                <Button
                  title={editingId ? 'Backtest' : 'Backtest (save the strategy first)'}
                  variant="ghost"
                  icon={<FlaskConical size={14} color={p.muted} />}
                  disabled={!editingId}
                  onPress={() => editingId && navigation.navigate('Backtesting', {savedId: editingId, symbol: testSymbol})}
                />
              </View>
            </>
          )}
        </Panel>

        {evaluate.data ? (
          <SignalCard s={evaluate.data} showSymbol index={0} onSymbolPress={symbol => navigation.navigate('StockDetail', {symbol})} />
        ) : null}

        {screen.data ? (
          <Animated.View entering={reduce ? undefined : FadeIn.duration(250)} exiting={reduce ? undefined : FadeOut.duration(150)}>
            <Panel
              title={`Screen results · ${screen.data.total} matched on the latest ${def.timeframe} bar`}
              action={<HeadLink label="Close" onPress={() => screen.reset()} />}>
              {screen.data.items.length === 0 ? (
                <EmptyState title="No stock meets every entry rule right now" />
              ) : (
                screen.data.items.map(s => (
                  <Pressable
                    key={s.symbol}
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('StockDetail', {symbol: s.symbol})}
                    style={({pressed}) => [styles.listRow, {borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
                    <View style={styles.flex}>
                      <Txt variant="small" weight="500">
                        {s.symbol}
                        <Txt variant="caption" tone="muted">
                          {'  '}
                          {s.sector}
                        </Txt>
                      </Txt>
                      <Txt variant="caption" tone="muted" numberOfLines={2}>
                        {s.matched.join(' · ')}
                      </Txt>
                    </View>
                    <View style={styles.end}>
                      <Txt variant="small" num>
                        {price(s.price)}
                      </Txt>
                      <Txt variant="caption" num color={changeColor(p, s.change_pct)}>
                        {pct(s.change_pct)}
                      </Txt>
                    </View>
                  </Pressable>
                ))
              )}
            </Panel>
          </Animated.View>
        ) : null}

        <Panel
          index={1}
          titleNode={
            <Tabs
              ruled={false}
              size="sm"
              value={list}
              onChange={setList}
              testID="strategy-list-tabs"
              items={[
                {value: 'mine', label: `My strategies${saved.data ? ` · ${saved.data.length}` : ''}`},
                {value: 'builtin', label: 'Built-in'},
              ]}
            />
          }>
          {list === 'mine' ? (
            saved.isLoading ? (
              <SkeletonRows />
            ) : (saved.data ?? []).length === 0 ? (
              <EmptyState title="No saved strategies" body="Build one above and save it to reuse in backtests." />
            ) : (
              (saved.data ?? []).map((s, i) => (
                <View
                  key={s.id}
                  style={[styles.listRow, i > 0 && {borderTopColor: p.rule}, i === 0 && styles.noTop, editingId === s.id && {backgroundColor: alpha(p.raised, 0.6)}]}>
                  <Pressable style={styles.flex} onPress={() => load(s.id)} accessibilityRole="button" accessibilityLabel={`Open ${s.name}`}>
                    <Txt variant="small" weight="500" numberOfLines={1}>
                      {s.name}
                    </Txt>
                    <Txt variant="caption" tone="muted" numberOfLines={2}>
                      {s.definition.entry.conditions.map(c => conditionText(c, cat)).join(` ${s.definition.entry.logic} `)}
                    </Txt>
                    <Txt variant="micro" tone="faint">
                      {s.definition.timeframe} · updated {relative(s.updated_at)}
                    </Txt>
                  </Pressable>
                  <View style={styles.actions}>
                    <IconBtn label={`Edit ${s.name}`} onPress={() => load(s.id)}>
                      <Pencil size={15} color={p.muted} />
                    </IconBtn>
                    <IconBtn
                      label={`Duplicate ${s.name}`}
                      onPress={() => m.duplicate.mutate(s.id, {onSuccess: () => toast.success('Duplicated'), onError: e => toast.error(errorText(e))})}>
                      <Copy size={15} color={p.muted} />
                    </IconBtn>
                    <IconBtn label={`Delete ${s.name}`} onPress={() => confirmDelete(s.id, s.name)}>
                      <Trash2 size={15} color={p.muted} />
                    </IconBtn>
                  </View>
                </View>
              ))
            )
          ) : (
            (builtin.data ?? []).map((b, i) => (
              <View key={b.key} style={[styles.listRow, i > 0 ? {borderTopColor: p.rule} : styles.noTop]}>
                <View style={styles.flex}>
                  <Txt variant="small" weight="500">
                    {b.name}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {b.description}
                  </Txt>
                  <Txt variant="micro" num tone="faint">
                    {b.params.map(x => `${x.label} ${x.default}`).join(' · ')}
                  </Txt>
                </View>
                <Button
                  title="Backtest"
                  size="sm"
                  variant="ghost"
                  testID={`builtin-backtest-${b.key}`}
                  onPress={() => navigation.navigate('Backtesting', {strategyKey: b.key})}
                />
              </View>
            ))
          )}
        </Panel>
      </ScrollView>
    </Screen>
  );
}

function IconBtn({label, onPress, children}: {label: string; onPress: () => void; children: React.ReactNode}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({pressed}) => [styles.iconBtn, pressed && {backgroundColor: p.raised}]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {paddingHorizontal: 16, paddingBottom: 96, gap: 12},
  flex: {flex: 1, minWidth: 0},
  end: {alignItems: 'flex-end'},
  note: {borderWidth: 1, borderRadius: radius.ctl, padding: 10},
  body: {padding: 16, gap: 20},
  mb8: {marginBottom: 8},
  mt4: {marginTop: 4},
  riskRow: {flexDirection: 'row', gap: 8},
  reads: {borderWidth: 1, borderRadius: radius.card, padding: 16},
  errs: {marginTop: 12, gap: 4},
  errRow: {flexDirection: 'row', gap: 6},
  icon: {marginTop: 1},
  test: {borderTopWidth: 1, paddingTop: 16, gap: 8},
  listRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1},
  noTop: {borderTopWidth: 0},
  actions: {flexDirection: 'row', gap: 2},
  iconBtn: {padding: 6, borderRadius: 4},
});
