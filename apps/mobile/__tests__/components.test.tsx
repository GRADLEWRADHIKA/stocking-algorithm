import React from 'react';
import {StyleSheet} from 'react-native';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {Badge, DataSourceBadge, PaperBadge, SimulatedBadge} from '../src/components/Badge';
import {PriceText} from '../src/components/PriceText';
import {Segmented} from '../src/components/Segmented';
import {darkPalette, lightPalette} from '../src/theme';
import {useThemeStore} from '../src/store/theme';

const colorOf = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).color;

describe('PriceText', () => {
  beforeEach(() => useThemeStore.setState({mode: 'dark'}));

  it('formats INR with Indian grouping', () => {
    render(<PriceText testID="p" value={1234567.5} />);
    expect(screen.getByText('₹12,34,567.50')).toBeTruthy();
  });

  it('uses gain / loss / neutral colours by change sign', () => {
    const {rerender} = render(<PriceText testID="p" value={100} change={2.5} />);
    expect(colorOf('p')).toBe(darkPalette.gain);
    rerender(<PriceText testID="p" value={100} change={-1} />);
    expect(colorOf('p')).toBe(darkPalette.loss);
    rerender(<PriceText testID="p" value={100} change={0} />);
    expect(colorOf('p')).toBe(darkPalette.textMuted);
    rerender(<PriceText testID="p" value={100} />);
    expect(colorOf('p')).toBe(darkPalette.text);
  });

  it('supports number / pct formats, signs and the light theme', () => {
    useThemeStore.setState({mode: 'light'});
    const {rerender} = render(<PriceText testID="p" value={1.5} format="pct" change={1.5} />);
    expect(screen.getByText('+1.50%')).toBeTruthy();
    expect(colorOf('p')).toBe(lightPalette.gain);
    rerender(<PriceText testID="p" value={-2500} format="number" sign />);
    expect(screen.getByText('-2,500.00')).toBeTruthy();
  });

  it('re-renders on value change with flash enabled without crashing', () => {
    const {rerender} = render(<PriceText testID="p" value={100} flash />);
    rerender(<PriceText testID="p" value={101} flash />);
    expect(screen.getByText('₹101.00')).toBeTruthy();
  });

  it('renders an em dash for missing values', () => {
    render(<PriceText testID="p" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('Badge', () => {
  it('renders the label and exposes it for accessibility', () => {
    render(<Badge label="BUY" tone="gain" testID="b" />);
    expect(screen.getByText('BUY')).toBeTruthy();
    expect(screen.getByLabelText('BUY')).toBeTruthy();
  });

  it('renders persistent simulated / paper badges', () => {
    render(
      <>
        <SimulatedBadge />
        <PaperBadge />
      </>,
    );
    expect(screen.getByText('Simulated data')).toBeTruthy();
    expect(screen.getByText('Paper trading')).toBeTruthy();
  });

  it('maps data_source to a non-misleading label', () => {
    const {rerender} = render(<DataSourceBadge source="HISTORICAL_DATASET" />);
    expect(screen.getByText('Historical dataset')).toBeTruthy();
    rerender(<DataSourceBadge source="PAPER_TRADING" />);
    expect(screen.getByText('Paper trading')).toBeTruthy();
    rerender(<DataSourceBadge source="DEMO_ANALYSIS" />);
    expect(screen.getByText('Demo analysis')).toBeTruthy();
    rerender(<DataSourceBadge source={undefined} />);
    expect(screen.getByText('Simulated data')).toBeTruthy();
  });
});

describe('Segmented', () => {
  const options = [
    {value: '1d', label: '1D'},
    {value: '1w', label: '1W'},
    {value: '1M', label: '1M'},
  ] as const;

  it('marks the selected option and calls onChange', () => {
    const onChange = jest.fn();
    render(<Segmented testID="seg" options={options} value="1d" onChange={onChange} />);
    expect(screen.getByTestId('seg-1d').props.accessibilityState).toEqual({selected: true});
    expect(screen.getByTestId('seg-1w').props.accessibilityState).toEqual({selected: false});
    fireEvent.press(screen.getByText('1W'));
    expect(onChange).toHaveBeenCalledWith('1w');
  });
});
