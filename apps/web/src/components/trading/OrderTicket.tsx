'use client';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAccounts, usePlaceOrder, usePositions } from '@/hooks/queries';
import { useLive } from '@/stores/live';
import { useUi } from '@/stores/ui';
import type { z } from 'zod';
import { orderSchema, type OrderForm } from '@/lib/schemas';
import { inr, price } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { SymbolSearch } from '@/components/layout/SymbolSearch';
import { Badge } from '@/components/ui/badge';

/** Simulated order entry. Validates locally, then the engine validates again and is authoritative. */
export function OrderTicket({ symbol: fixedSymbol, refPrice, onDone, defaultSide = 'BUY' }: { symbol?: string; refPrice?: number; onDone?: () => void; defaultSide?: 'BUY' | 'SELL' }) {
  const { data: accounts } = useAccounts();
  const { activeAccountId, setActiveAccount } = useUi();
  const account = accounts?.find((a) => a.id === activeAccountId) ?? accounts?.[0];
  const place = usePlaceOrder(account?.id ?? null);
  const positions = usePositions(account?.id ?? null);
  const [confirming, setConfirming] = useState<OrderForm | null>(null);

  const form = useForm<z.input<typeof orderSchema>, unknown, OrderForm>({
    resolver: zodResolver(orderSchema),
    defaultValues: { symbol: fixedSymbol ?? '', side: defaultSide, order_type: 'MARKET', quantity: 1 },
  });
  const { register, handleSubmit, setValue, control, formState } = form;
  const v = useWatch({ control });
  const live = useLive((s) => (v.symbol ? s.ticks[v.symbol] : undefined));
  const ltp = live?.price ?? (v.symbol === fixedSymbol ? refPrice : undefined);
  const px = v.order_type === 'LIMIT' && v.limit_price ? Number(v.limit_price) : ltp;
  const qty = Number(v.quantity) || 0;
  const estimate = px ? px * qty : null;
  const held = positions.data?.find((p) => p.symbol === v.symbol)?.quantity ?? 0;

  useEffect(() => {
    if (fixedSymbol) setValue('symbol', fixedSymbol);
  }, [fixedSymbol, setValue]);

  if (!account)
    return <p className="text-[13px] text-muted">Create a paper account on the Paper Trading screen first.</p>;

  const submit = (o: OrderForm) => {
    place.mutate(
      {
        symbol: o.symbol,
        side: o.side,
        order_type: o.order_type,
        quantity: o.quantity,
        limit_price: o.order_type === 'LIMIT' ? o.limit_price ?? null : null,
        stop_loss: o.stop_loss ?? null,
        take_profit: o.take_profit ?? null,
      },
      {
        onSuccess: (res) => {
          setConfirming(null);
          if (res.status === 'REJECTED') toast.error('Order rejected', { description: res.rejection_reason ?? undefined });
          else
            toast.success(res.status === 'FILLED' ? 'Paper order filled' : 'Paper order placed', {
              description: `${res.side} ${res.quantity} ${res.symbol}${res.avg_fill_price ? ` @ ${price(res.avg_fill_price)}` : res.limit_price ? ` limit ${price(res.limit_price)}` : ''}`,
            });
          if (res.status !== 'REJECTED') onDone?.();
        },
        onError: (e) => {
          setConfirming(null);
          toast.error('Order not accepted', { description: e.message });
        },
      },
    );
  };

  const buy = v.side === 'BUY';
  const e = formState.errors;

  return (
    <div className="relative">
      <form onSubmit={handleSubmit((o) => setConfirming(o))} className="space-y-3" noValidate>
        <div className="flex items-center justify-between gap-2">
          <Badge tone="accent">Paper trading</Badge>
          {accounts && accounts.length > 1 ? (
            <Select value={account.id} onChange={(ev) => setActiveAccount(Number(ev.target.value))} className="h-7 w-auto text-xs" aria-label="Paper account">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          ) : (
            <span className="text-xs text-muted">{account.name}</span>
          )}
        </div>

        <div className="relative grid grid-cols-2 rounded-ctl bg-raised p-0.5">
          <motion.span
            className={cn('absolute inset-y-0.5 w-[calc(50%-2px)] rounded-[5px]', buy ? 'bg-up' : 'bg-down')}
            animate={{ x: buy ? 0 : '100%' }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            style={{ left: 2 }}
          />
          {(['BUY', 'SELL'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setValue('side', s)} className={cn('relative z-10 h-8 text-[13px] font-semibold transition-colors', v.side === s ? 'text-white' : 'text-muted hover:text-ink')}>
              {s === 'BUY' ? 'Buy' : 'Sell'}
            </button>
          ))}
        </div>

        {!fixedSymbol ? (
          <Field label="Stock" error={e.symbol?.message}>
            {v.symbol ? (
              <div className="flex items-center justify-between rounded-ctl border border-line px-3 py-1.5">
                <span className="font-medium">{v.symbol}</span>
                <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setValue('symbol', '')}>
                  Change
                </button>
              </div>
            ) : (
              <SymbolSearch onPick={(s) => setValue('symbol', s, { shouldValidate: true })} placeholder="Pick a stock" />
            )}
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Order type">
            <Select {...register('order_type')}>
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
            </Select>
          </Field>
          <Field label="Quantity" error={e.quantity?.message} hint={v.side === 'SELL' ? `${held} held` : undefined}>
            <Input type="number" min={1} step={1} className="num" {...register('quantity')} />
          </Field>
        </div>
        <AnimatePresence initial={false}>
          {v.order_type === 'LIMIT' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <Field label="Limit price ₹" error={e.limit_price?.message}>
                <Input type="number" step="0.05" min={0} className="num" placeholder={ltp ? price(ltp) : ''} {...register('limit_price')} />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stop-loss ₹ (optional)" error={e.stop_loss?.message}>
            <Input type="number" step="0.05" min={0} className="num" {...register('stop_loss')} />
          </Field>
          <Field label="Target ₹ (optional)" error={e.take_profit?.message}>
            <Input type="number" step="0.05" min={0} className="num" {...register('take_profit')} />
          </Field>
        </div>

        <dl className="space-y-1 rounded-ctl bg-raised/60 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted">Last simulated price</dt>
            <dd className="num">{price(ltp)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Estimated value</dt>
            <dd className="num">{inr(estimate)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Available cash</dt>
            <dd className={cn('num', buy && estimate && estimate > account.cash_balance ? 'text-down' : '')}>{inr(account.cash_balance)}</dd>
          </div>
        </dl>

        <Button type="submit" variant={buy ? 'buy' : 'sell'} size="lg" className="w-full">
          Review {buy ? 'buy' : 'sell'} order
        </Button>
      </form>

      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute inset-0 z-10 flex flex-col justify-end rounded-card bg-surface/95"
          >
            <div className="space-y-3 rounded-card border border-line bg-surface p-4">
              <p className="text-[13px] font-semibold">Confirm paper order</p>
              <p className="text-[13px]">
                <span className={buy ? 'text-up' : 'text-down'}>{confirming.side}</span> {confirming.quantity} {confirming.symbol} at{' '}
                {confirming.order_type === 'MARKET' ? 'market (simulated price + slippage)' : `limit ${price(confirming.limit_price)}`}
                {confirming.stop_loss ? `, stop ${price(confirming.stop_loss)}` : ''}
                {confirming.take_profit ? `, target ${price(confirming.take_profit)}` : ''}.
              </p>
              <p className="text-xs text-muted">Virtual money only. No order reaches any exchange or broker.</p>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setConfirming(null)}>
                  Back
                </Button>
                <Button variant={buy ? 'buy' : 'sell'} className="flex-1" loading={place.isPending} onClick={() => submit(confirming)}>
                  Place order
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
