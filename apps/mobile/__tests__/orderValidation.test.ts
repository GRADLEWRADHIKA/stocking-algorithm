import {validateOrder} from '../src/utils/orderValidation';

const base = {side: 'BUY' as const, orderType: 'MARKET' as const, quantity: '10', limitPrice: '', stopLoss: '', takeProfit: ''};

describe('validateOrder', () => {
  it('accepts a simple market buy within cash', () => {
    const v = validateOrder(base, 100, 10_000);
    expect(v.valid).toBe(true);
    expect(v.estValue).toBe(1000);
  });

  it('rejects bad quantity, missing limit price and insufficient funds', () => {
    expect(validateOrder({...base, quantity: '1.5'}, 100, 1e6).errors.quantity).toBeTruthy();
    expect(validateOrder({...base, orderType: 'LIMIT'}, 100, 1e6).errors.limitPrice).toBeTruthy();
    expect(validateOrder({...base, quantity: '1000'}, 100, 5000).errors.funds).toBeTruthy();
  });

  it('checks bracket levels relative to entry for BUY and SELL', () => {
    const buy = validateOrder({...base, stopLoss: '105', takeProfit: '95'}, 100, 1e6);
    expect(buy.errors.stopLoss).toBeTruthy();
    expect(buy.errors.takeProfit).toBeTruthy();
    const sell = validateOrder({...base, side: 'SELL', stopLoss: '110', takeProfit: '90'}, 100, 1e6, 10);
    expect(sell.valid).toBe(true);
    expect(validateOrder({...base, side: 'SELL'}, 100, 1e6, 0).warning).toBeTruthy();
  });
});
