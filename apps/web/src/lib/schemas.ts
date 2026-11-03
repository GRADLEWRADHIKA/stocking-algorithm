import { z } from 'zod';

/** Optional numeric input: '' / null / undefined become undefined instead of coercing to 0. */
const optNum = (inner: z.ZodNumber) =>
  z.preprocess((v) => (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v), z.coerce.number().pipe(inner).optional());

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your name').max(80),
    email: z.string().trim().email('Enter a valid email address'),
    password: passwordRule,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const resetConfirmSchema = z
  .object({ token: z.string().trim().min(10, 'Paste the reset token'), new_password: passwordRule, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const orderSchema = z
  .object({
    symbol: z.string().min(1, 'Choose a stock'),
    side: z.enum(['BUY', 'SELL']),
    order_type: z.enum(['MARKET', 'LIMIT']),
    quantity: z.coerce.number({ invalid_type_error: 'Enter a quantity' }).int('Whole shares only').positive('Quantity must be at least 1').max(1_000_000),
    limit_price: optNum(z.number().positive('Limit price must be above 0')),
    stop_loss: optNum(z.number().positive('Must be above 0')),
    take_profit: optNum(z.number().positive('Must be above 0')),
  })
  .superRefine((v, ctx) => {
    if (v.order_type === 'LIMIT' && !v.limit_price) ctx.addIssue({ code: 'custom', path: ['limit_price'], message: 'A limit order needs a limit price' });
    const ref = v.limit_price;
    if (ref && v.side === 'BUY') {
      if (v.stop_loss && v.stop_loss >= ref) ctx.addIssue({ code: 'custom', path: ['stop_loss'], message: 'Stop-loss must be below the entry for a buy' });
      if (v.take_profit && v.take_profit <= ref) ctx.addIssue({ code: 'custom', path: ['take_profit'], message: 'Target must be above the entry for a buy' });
    }
  });

export type OrderForm = z.infer<typeof orderSchema>;

export const backtestSchema = z
  .object({
    symbol: z.string().min(1),
    timeframe: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']),
    start: z.string().optional(),
    end: z.string().optional(),
    initial_capital: z.coerce.number().min(1000, 'Minimum ₹1,000').max(1e10),
    position_size_pct: z.coerce.number().gt(0, 'Above 0%').max(100, 'At most 100%'),
    brokerage_pct: z.coerce.number().min(0).max(5),
    brokerage_flat: z.coerce.number().min(0).max(10000),
    transaction_cost_pct: z.coerce.number().min(0).max(5),
    slippage_bps: z.coerce.number().min(0).max(500),
    stop_loss_pct: optNum(z.number().gt(0, 'Above 0%').max(90)),
    take_profit_pct: optNum(z.number().gt(0, 'Above 0%').max(500)),
    out_of_sample_pct: z.coerce.number().min(0).max(80),
  })
  .refine((v) => !v.start || !v.end || v.start < v.end, { path: ['end'], message: 'End must be after start' });
