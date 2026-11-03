import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {SignalCard} from '../src/components/SignalCard';
import type {Signal} from '../src/api/types';

const signal: Signal = {
  id: 7,
  symbol: 'RELIANCE',
  exchange: 'NSE',
  strategy: 'Supertrend Trend Rider',
  strategy_key: 'supertrend',
  timeframe: '1d',
  timestamp: '2026-11-03T00:00:00+05:30',
  data_source: 'SIMULATED',
  action: 'BUY',
  price: 2500,
  entry_conditions: ['Close above Supertrend(10, 3)', 'Supertrend direction flips up'],
  exit_conditions: ['Supertrend direction flips down'],
  indicator_values: {supertrend: 2410},
  conditions: [
    {description: 'Supertrend direction is up', satisfied: true, value: '+1'},
    {description: 'Close above Supertrend', satisfied: true, value: '2,500.00 > 2,410.00'},
    {description: 'Volume above 20-bar average', satisfied: false, value: '0.82x'},
  ],
  stop_loss: 2400,
  take_profit: 2750,
  risk_reward: 2.5,
  position_size: {quantity: 40, capital_required: 100000, capital_at_risk: 4000, risk_per_trade_pct: 1, assumed_capital: 400000},
  strength: {
    score: 66,
    label: 'MODERATE',
    method: 'Weighted average of normalised condition margins.',
    components: [
      {name: 'Trend alignment', weight: 0.5, value: 0.8},
      {name: 'Volume', weight: 0.5, value: 0.3},
    ],
  },
  historical_performance: {trades: 12, win_rate: 58.3, avg_return_pct: 1.2, lookback: '3y', note: 'Past results on simulated data.'},
  explanation: 'Price is above the Supertrend line, which turned up two bars ago.',
  disclaimer: 'Educational analysis of simulated data. Not investment advice.',
};

const textOf = (node: {props: {[k: string]: unknown}}) => ([] as unknown[]).concat(node.props.children as unknown).join('');

describe('SignalCard (same content as the web card)', () => {
  it('renders the condition checklist with met / not met and values', () => {
    render(<SignalCard s={signal} />);
    expect(screen.getByText('Conditions checked')).toBeTruthy();
    expect(textOf(screen.getByTestId('conditions-met'))).toBe('2 of 3 met');
    expect(screen.getByLabelText('Met: Supertrend direction is up, +1')).toBeTruthy();
    expect(screen.getByLabelText('Not met: Volume above 20-bar average, 0.82x')).toBeTruthy();
    expect(screen.getByText('2,500.00 > 2,410.00')).toBeTruthy();
  });

  it('shows explanation, entry / exit rules and the price ladder to scale', () => {
    render(<SignalCard s={signal} />);
    expect(screen.getByText(signal.explanation)).toBeTruthy();
    expect(screen.getByText('Entry rules')).toBeTruthy();
    expect(screen.getByText('Exit rules')).toBeTruthy();
    expect(screen.getByText('Supertrend direction flips down')).toBeTruthy();
    expect(screen.getByTestId('price-ladder')).toBeTruthy();
    expect(screen.getByText('Stop-loss')).toBeTruthy();
    expect(screen.getByText('Analysed price')).toBeTruthy();
    expect(screen.getByText('Take-profit')).toBeTruthy();
    expect(screen.getByText('2,400.00')).toBeTruthy();
    expect(screen.getByText('2,750.00')).toBeTruthy();
  });

  it('shows risk:reward, sizing, past trades and strength components with weights', () => {
    render(<SignalCard s={signal} />);
    expect(screen.getByText('1 : 2.50')).toBeTruthy();
    expect(screen.getByText('40 shares')).toBeTruthy();
    expect(screen.getByText('₹1,00,000')).toBeTruthy();
    expect(screen.getByText('₹4,000 (1.0% of ₹4,00,000)')).toBeTruthy();
    expect(screen.getByText('12 · win 58%')).toBeTruthy();
    expect(screen.getByText('Strength score 66/100 · moderate')).toBeTruthy();
    expect(screen.getByText('Trend alignment')).toBeTruthy();
    expect(screen.getAllByText('×0.50')).toHaveLength(2);
    expect(screen.getByText(signal.strength.method)).toBeTruthy();
  });

  it('ends with the note and the disclaimer, and labels the data source', () => {
    render(<SignalCard s={signal} />);
    const text = textOf(screen.getByTestId('signal-disclaimer'));
    expect(text).toContain('Past results on simulated data.');
    expect(text).toContain('Not investment advice.');
    expect(screen.getByText('Simulated data')).toBeTruthy();
    expect(screen.getByText('BUY')).toBeTruthy();
  });

  it('omits the ladder and sizing when the signal has none', () => {
    render(<SignalCard s={{...signal, stop_loss: null, position_size: null, historical_performance: null}} />);
    expect(screen.queryByTestId('price-ladder')).toBeNull();
    expect(screen.queryByText('Suggested size')).toBeNull();
  });
});
