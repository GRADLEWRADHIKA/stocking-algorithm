import React, {useEffect, useMemo, useState} from 'react';
import {Alert as RNAlert, Pressable, StyleSheet, View} from 'react-native';
import {GripVertical, Pencil, Plus, Trash2, X} from 'lucide-react-native';
import {useWatchlistMutations, useWatchlists} from '../api/hooks';
import type {WatchlistItem} from '../api/types';
import {Button, EmptyState, ErrorState, FlashPrice, Panel, Screen, SkeletonRows, SourceBadge, Tabs, TextField, Txt, toast} from '../components';
import {AlertForm, AlertList, useArmedCount} from '../components/watchlist/Alerts';
import {DraggableList} from '../components/watchlist/DraggableList';
import {SymbolSearch} from '../components/watchlist/SymbolSearch';
import {useTick} from '../hooks/useLiveQuotes';
import type {TabScreenProps} from '../navigation/types';
import {changeColor, usePalette} from '../theme';
import {pct, signed} from '../utils/fmt';
import {commitIfChanged, orderedSymbols} from '../utils/reorder';
import {HeaderActions} from './shared';

function RowBody({it}: {it: WatchlistItem}) {
  const p = usePalette();
  const l = useTick(it.symbol);
  const c = l?.change_pct ?? it.change_pct;
  return (
    <>
      <GripVertical size={16} color={p.faint} />
      <View style={styles.flex}>
        <Txt variant="small" weight="500">
          {it.symbol}
        </Txt>
        <Txt variant="caption" tone="muted" numberOfLines={1}>
          {it.name}
        </Txt>
      </View>
      <View style={styles.right}>
        <FlashPrice value={l?.price ?? it.price} dir={l?.dir} variant="small" />
        <Txt variant="micro" num color={changeColor(p, c)}>
          {signed(l?.change ?? it.change)} ({pct(c)})
        </Txt>
      </View>
    </>
  );
}

export function WatchlistScreen({navigation}: TabScreenProps<'Watchlist'>) {
  const p = usePalette();
  const {data, isLoading, isError, error, refetch, isRefetching} = useWatchlists();
  const m = useWatchlistMutations();
  const armed = useArmedCount();
  const [activeId, setActiveId] = useState<number | null>(null);
  const wl = data?.find(w => w.id === activeId) ?? data?.[0];
  const serverOrder = useMemo(() => (wl ? orderedSymbols(wl.items) : []), [wl]);
  const [order, setOrder] = useState<string[]>(serverOrder);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => setOrder(serverOrder), [serverOrder]);

  const bySymbol = useMemo(() => new Map((wl?.items ?? []).map(i => [i.symbol, i])), [wl]);
  const ids = order.filter(s => bySymbol.has(s));

  const onDrop = (next: string[]) => {
    if (!wl) {
      return;
    }
    setOrder(next);
    commitIfChanged(serverOrder, next, symbols =>
      m.reorder.mutate({id: wl.id, symbols}, {onError: e => toast.error((e as Error).message)}),
    );
  };

  const createList = () =>
    m.create.mutate(`Watchlist ${(data?.length ?? 0) + 1}`, {onSuccess: w => setActiveId(w.id), onError: e => toast.error((e as Error).message)});

  const confirmDelete = () => {
    if (!wl) {
      return;
    }
    RNAlert.alert('Delete list', `Delete “${wl.name}”?`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => m.remove.mutate(wl.id, {onSuccess: () => setActiveId(null)})},
    ]);
  };

  return (
    <Screen
      testID="watchlist-screen"
      title="Watchlists"
      right={<HeaderActions />}
      refreshing={isRefetching}
      onRefresh={refetch}
      keyboard
      headerExtra={
        <View style={styles.sub}>
          <Txt variant="small" tone="muted" style={styles.flex}>
            Long-press and drag rows to reorder. Prices stream from the simulator.
          </Txt>
          <SourceBadge source="SIMULATED" />
        </View>
      }>
      <View style={styles.actions}>
        <Button testID="new-list" size="sm" title="New list" icon={<Plus size={14} color={p.ink} />} loading={m.create.isPending} onPress={createList} />
      </View>

      <Panel
        index={0}
        titleNode={
          data && data.length > 0 ? (
            <Tabs
              testID="wl-tabs"
              ruled={false}
              size="sm"
              value={String(wl?.id ?? '')}
              onChange={v => {
                setActiveId(Number(v));
                setRenaming(false);
              }}
              items={data.map(w => ({value: String(w.id), label: `${w.name} · ${w.items.length}`}))}
            />
          ) : (
            <Txt variant="title">Watchlist</Txt>
          )
        }
        action={
          wl ? (
            <>
              <Pressable
                testID="rename-list"
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Rename list"
                onPress={() => {
                  setNewName(wl.name);
                  setRenaming(r => !r);
                }}>
                <Pencil size={14} color={p.muted} />
              </Pressable>
              <Pressable testID="delete-list" hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete list" onPress={confirmDelete}>
                <Trash2 size={14} color={p.muted} />
              </Pressable>
            </>
          ) : null
        }>
        {renaming && wl ? (
          <View style={[styles.rename, {borderBottomColor: p.rule}]}>
            <TextField
              containerStyle={styles.flex}
              size="sm"
              value={newName}
              onChangeText={setNewName}
              autoFocus
              accessibilityLabel="New list name"
              onSubmitEditing={() => m.rename.mutate({id: wl.id, name: newName.trim() || wl.name}, {onSuccess: () => setRenaming(false)})}
            />
            <Button
              size="sm"
              variant="primary"
              title="Save"
              loading={m.rename.isPending}
              onPress={() => m.rename.mutate({id: wl.id, name: newName.trim() || wl.name}, {onSuccess: () => setRenaming(false)})}
            />
            <Button size="sm" variant="ghost" title="Cancel" onPress={() => setRenaming(false)} />
          </View>
        ) : null}
        {isLoading ? (
          <SkeletonRows rows={6} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !wl ? (
          <EmptyState title="No watchlists" action={<Button size="sm" title="Create one" onPress={() => m.create.mutate('My watchlist')} />} />
        ) : (
          <>
            <View style={[styles.add, {borderBottomColor: p.rule}]}>
              <SymbolSearch
                testID="wl-add"
                placeholder="Add a symbol to this list"
                onPick={s =>
                  m.addItem.mutate(
                    {id: wl.id, symbol: s},
                    {onSuccess: () => toast.success(`${s} added to ${wl.name}`), onError: e => toast.error((e as Error).message)},
                  )
                }
              />
            </View>
            {ids.length === 0 ? (
              <EmptyState title="This list is empty" body="Search above to add stocks." />
            ) : (
              <DraggableList
                ids={ids}
                onDrop={onDrop}
                onTap={sym => navigation.navigate('StockDetail', {symbol: sym})}
                renderRow={id => <RowBody it={bySymbol.get(id)!} />}
                renderTrailing={id => (
                  <Pressable
                    testID={`remove-${id}`}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${id}`}
                    onPress={() => m.removeItem.mutate({id: wl.id, symbol: id})}
                    style={styles.remove}>
                    <X size={14} color={p.faint} />
                  </Pressable>
                )}
              />
            )}
          </>
        )}
      </Panel>

      <Panel index={1} title="New alert">
        <AlertForm defaultSymbol={ids[0]} />
      </Panel>
      <Panel
        index={2}
        title={`Alerts · ${armed} armed`}
        action={
          <Pressable onPress={() => navigation.navigate('Alerts')} hitSlop={8} accessibilityRole="link">
            <Txt variant="caption" tone="muted">
              Manage
            </Txt>
          </Pressable>
        }>
        <AlertList />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  sub: {flexDirection: 'row', alignItems: 'center', gap: 8},
  actions: {flexDirection: 'row', justifyContent: 'flex-end'},
  right: {alignItems: 'flex-end', paddingRight: 4},
  rename: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1},
  add: {paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1},
  remove: {paddingHorizontal: 14, height: '100%', justifyContent: 'center'},
});
