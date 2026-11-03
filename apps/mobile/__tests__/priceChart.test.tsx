import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {CandleChart} from '../src/components/charts/CandleChart';
import type {Candle, IndicatorSeries} from '../src/api/types';

const candles: Candle[] = Array.from({length: 30}, (_, i) => ({
  time: 1_700_000_000 + i * 86400,
  open: 100 + i,
  high: 103 + i,
  low: 98 + i,
  close: 101 + i + (i % 3 === 0 ? -3 : 1),
  volume: 1000 + i * 10,
}));
const dirs = candles.map((_, i) => (i < 10 ? 1 : i < 20 ? -1 : 1));
const st: IndicatorSeries = {
  id: 'supertrend_10_3',
  indicator: 'supertrend',
  name: 'ST(10, 3)',
  pane: 'overlay',
  params: {period: 10, multiplier: 3},
  lines: {
    value: candles.map(c => ({time: c.time, value: c.low - 2})),
    direction: candles.map((c, i) => ({time: c.time, value: dirs[i]})),
  },
};
const rsi: IndicatorSeries = {
  id: 'rsi_14',
  indicator: 'rsi',
  name: 'RSI(14)',
  pane: 'separate',
  params: {period: 14},
  lines: {value: candles.map((c, i) => ({time: c.time, value: 40 + i}))},
};

describe('CandleChart', () => {
  it('draws Supertrend as one path per regime (green up / red down) and renders panes', () => {
    render(<CandleChart candles={candles} overlays={[st]} panes={[rsi]} visibleBars={30} />);
    fireEvent(screen.getByLabelText(/Price chart/), 'layout', {nativeEvent: {layout: {width: 360, height: 320, x: 0, y: 0}}});
    expect(screen.getAllByTestId('supertrend-up')).toHaveLength(2);
    expect(screen.getAllByTestId('supertrend-down')).toHaveLength(1);
    expect(screen.getByTestId('pane-rsi')).toBeTruthy();
    expect(screen.getByText('RSI(14)')).toBeTruthy();
    expect(screen.getByText('ST(10, 3)')).toBeTruthy();
  });

  it('renders line and area kinds', () => {
    for (const kind of ['line', 'area'] as const) {
      const {unmount} = render(<CandleChart candles={candles} kind={kind} />);
      fireEvent(screen.getByLabelText(/Price chart/), 'layout', {nativeEvent: {layout: {width: 360, height: 320, x: 0, y: 0}}});
      expect(screen.getByText(/^O/)).toBeTruthy();
      unmount();
    }
  });
});
