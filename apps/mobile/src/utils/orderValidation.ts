import type {OrderSide, PaperOrder} from '../api/types';
import {price} from './fmt';

export interface OrderDraft {
  side: OrderSide;
  orderType: 'MARKET' | 'LIMIT';
  quantity: string;
  limitPrice: string;
  stopLoss: string;
  takeProfit: string;
}

export interface OrderValidation {
  errors: Partial<Record<'quantity' | 'limitPrice' | 'stopLoss' | 'takeProfit' | 'funds', string>>;
  quantity: number | null;
  limitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Reference price used for value / bracket checks (limit price or LTP). */
  refPrice: number | null;
  estValue: number | null;
  warning: string | null;
  valid: boolean;
}

function parse(v: string): number | null | 'invalid' {
  const t = v.replace(/,/g, '').trim();
  if (!t) {
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 'invalid';
}

/** Client-side validation mirroring the paper-trading engine's basic rules. */
export function validateOrder(d: OrderDraft, ltp: number | null, cash: number | null, heldQty = 0): OrderValidation {
  const errors: OrderValidation['errors'] = {};
  const q = parse(d.quantity);
  const lp = parse(d.limitPrice);
  const sl = parse(d.stopLoss);
  const tp = parse(d.takeProfit);

  let quantity: number | null = null;
  if (q === null) {
    errors.quantity = 'Enter a quantity';
  } else if (q === 'invalid' || !Number.isInteger(q) || q > 1_000_000) {
    errors.quantity = q !== 'invalid' && !Number.isInteger(q) ? 'Whole shares only' : 'Quantity must be at least 1';
  } else {
    quantity = q;
  }

  let limitPrice: number | null = null;
  if (d.orderType === 'LIMIT') {
    if (lp === null) {
      errors.limitPrice = 'A limit order needs a limit price';
    } else if (lp === 'invalid') {
      errors.limitPrice = 'Limit price must be above 0';
    } else {
      limitPrice = lp;
    }
  }

  const refPrice = d.orderType === 'LIMIT' ? limitPrice : ltp;
  const stopLoss = sl === 'invalid' ? null : sl;
  const takeProfit = tp === 'invalid' ? null : tp;
  if (sl === 'invalid') {
    errors.stopLoss = 'Must be above 0';
  }
  if (tp === 'invalid') {
    errors.takeProfit = 'Must be above 0';
  }
  if (refPrice !== null) {
    if (d.side === 'BUY') {
      if (stopLoss !== null && stopLoss >= refPrice) {
        errors.stopLoss = 'Stop-loss must be below the entry for a buy';
      }
      if (takeProfit !== null && takeProfit <= refPrice) {
        errors.takeProfit = 'Target must be above the entry for a buy';
      }
    } else {
      if (stopLoss !== null && stopLoss <= refPrice) {
        errors.stopLoss = 'Stop-loss must be above the entry for a sell';
      }
      if (takeProfit !== null && takeProfit >= refPrice) {
        errors.takeProfit = 'Target must be below the entry for a sell';
      }
    }
  }

  const estValue = quantity !== null && refPrice !== null ? quantity * refPrice : null;
  if (d.side === 'BUY' && estValue !== null && cash !== null && estValue > cash) {
    errors.funds = 'Estimated value is above your available virtual cash';
  }
  // SELL beyond holdings is left to the server (it decides whether shorting is allowed);
  // the ticket surfaces it as a warning instead.
  const warning =
    d.side === 'SELL' && quantity !== null && quantity > heldQty
      ? heldQty
        ? `You hold ${heldQty} shares; the engine may reject selling more.`
        : 'You hold no position in this symbol; the engine may reject this sell.'
      : null;

  return {
    warning,
    errors,
    quantity,
    limitPrice,
    stopLoss,
    takeProfit,
    refPrice,
    estValue,
    valid: Object.keys(errors).length === 0,
  };
}

/** Confirmation sentence (web OrderTicket confirm step). */
export function orderSentence(o: {
  side: OrderSide;
  quantity: number;
  symbol: string;
  orderType: 'MARKET' | 'LIMIT';
  limitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
}): string {
  return (
    `${o.side} ${o.quantity} ${o.symbol} at ` +
    (o.orderType === 'MARKET' ? 'market (simulated price + slippage)' : `limit ${price(o.limitPrice)}`) +
    (o.stopLoss ? `, stop ${price(o.stopLoss)}` : '') +
    (o.takeProfit ? `, target ${price(o.takeProfit)}` : '') +
    '.'
  );
}

export interface OrderOutcome {
  kind: 'rejected' | 'filled' | 'placed';
  title: string;
  description: string;
}

/**
 * How a placed order is reported. The engine answers 201 even when it refuses an order for funds or
 * holdings — status REJECTED with a rejection_reason — so that must never read as a success.
 */
export function orderOutcome(res: PaperOrder): OrderOutcome {
  if (res.status === 'REJECTED') {
    return {kind: 'rejected', title: 'Order rejected', description: res.rejection_reason ?? 'The paper engine refused this order.'};
  }
  const detail = res.avg_fill_price
    ? ` @ ${price(res.avg_fill_price)}`
    : res.limit_price
    ? ` limit ${price(res.limit_price)}`
    : '';
  return {
    kind: res.status === 'FILLED' ? 'filled' : 'placed',
    title: res.status === 'FILLED' ? 'Paper order filled' : 'Paper order placed',
    description: `${res.side} ${res.quantity} ${res.symbol}${detail}`,
  };
}
