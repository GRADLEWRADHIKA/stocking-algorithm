import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Tabs } from '@/components/ui/tabs';
import { ActionBadge, SourceBadge } from '@/components/ui/badge';
import { SignalCard } from '@/components/analysis/SignalCard';
import { Markdown } from '@/components/assistant/Markdown';
import type { Signal } from '@shared/types/api';

function TabsHarness() {
  const [v, setV] = useState<'a' | 'b'>('a');
  return (
    <>
      <Tabs value={v} onChange={setV} items={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />
      <p>selected:{v}</p>
    </>
  );
}

const signal: Signal = {
  id: 1,
  symbol: 'TCS',
  exchange: 'NSE',
  strategy: 'Moving Average Crossover',
  strategy_key: 'ma_crossover',
  timeframe: '1d',
  timestamp: '2026-11-02T10:00:00+05:30',
  data_source: 'SIMULATED',
  action: 'BUY',
  price: 4000,
  entry_conditions: ['EMA 20 crosses above EMA 50'],
  exit_conditions: ['EMA 20 crosses below EMA 50'],
  indicator_values: { ema_20: 3990, ema_50: 3980 },
  conditions: [
    { description: 'EMA 20 crossed above EMA 50 on this bar', satisfied: true, value: '3,990.00 > 3,980.00' },
    { description: 'Close above SMA 200', satisfied: false, value: null },
  ],
  stop_loss: 3880,
  take_profit: 4240,
  risk_reward: 2,
  position_size: { quantity: 83, capital_required: 332000, capital_at_risk: 9960, risk_per_trade_pct: 1, assumed_capital: 1000000 },
  strength: { score: 64, label: 'MODERATE', method: 'Weighted sum of normalised condition margins', components: [{ name: 'Cross margin', weight: 0.5, value: 0.7 }] },
  historical_performance: { trades: 12, win_rate: 50, avg_return_pct: 1.2, lookback: '3y', note: 'Past results are not a probability.' },
  explanation: 'The short EMA moved above the long EMA.',
  disclaimer: 'Educational output on simulated data. Not investment advice.',
};

describe('components', () => {
  it('Tabs switches selection and exposes aria-selected', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(screen.getByText('selected:b')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
  });

  it('labels every data source plainly', () => {
    render(
      <>
        <SourceBadge source="SIMULATED" />
        <SourceBadge source="HISTORICAL_DATASET" />
        <SourceBadge source="PAPER_TRADING" />
        <ActionBadge action="SELL" />
      </>,
    );
    expect(screen.getByText('Simulated data')).toBeInTheDocument();
    expect(screen.getByText('Historical dataset')).toBeInTheDocument();
    expect(screen.getByText('Paper trading')).toBeInTheDocument();
    expect(screen.getByText('SELL')).toBeInTheDocument();
  });

  it('SignalCard shows conditions, levels, sizing and the disclaimer', () => {
    render(<SignalCard s={signal} />);
    expect(screen.getByText('1 of 2 met')).toBeInTheDocument();
    expect(screen.getByText('EMA 20 crossed above EMA 50 on this bar')).toBeInTheDocument();
    expect(screen.getByText('1 : 2.00')).toBeInTheDocument();
    expect(screen.getByText('83 shares')).toBeInTheDocument();
    expect(screen.getByText('3,880.00')).toBeInTheDocument();
    expect(screen.getByText(/Not investment advice/)).toBeInTheDocument();
    expect(screen.getByText('Simulated data')).toBeInTheDocument();
  });

  it('Markdown renders lists, bold and tables without injecting HTML', () => {
    render(<Markdown text={'## Title\n- **RSI** is 55\n\n| Metric | Value |\n|---|---|\n| ADX | 31.2 |\n\n<script>alert(1)</script>'} />);
    expect(screen.getByText('RSI').tagName).toBe('STRONG');
    expect(screen.getByText('31.2')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });
});
