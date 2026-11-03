import React from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import {Tabs} from './Tabs';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md';
  testID?: string;
}

/** Compact selector (1D 1W 1M …) with the same sliding saffron line and no rule underneath — web `Segmented`. */
export function Segmented<T extends string>({options, value, onChange, style, size = 'sm', testID}: SegmentedProps<T>) {
  return <Tabs items={options} value={value} onChange={onChange} size={size} ruled={false} style={style} testID={testID} gap={12} />;
}
