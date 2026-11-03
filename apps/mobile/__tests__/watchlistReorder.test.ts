import {commitIfChanged, finishDrag, indexForOffset, moveItem, orderedSymbols} from '../src/utils/reorder';

describe('watchlist reorder helpers', () => {
  const order = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ITC'];

  it('moves an item and clamps indices', () => {
    expect(moveItem(order, 0, 2)).toEqual(['TCS', 'INFY', 'RELIANCE', 'HDFCBANK', 'ITC']);
    expect(moveItem(order, 4, 0)).toEqual(['ITC', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK']);
    expect(moveItem(order, 1, 99)).toEqual(['RELIANCE', 'INFY', 'HDFCBANK', 'ITC', 'TCS']);
    expect(moveItem(order, 9, 0)).toEqual(order);
    expect(order).toEqual(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ITC']); // not mutated
  });

  it('maps a drag distance to a target slot', () => {
    expect(indexForOffset(0, 0, 56, 5)).toBe(0);
    expect(indexForOffset(0, 120, 56, 5)).toBe(2);
    expect(indexForOffset(3, -200, 56, 5)).toBe(0);
    expect(indexForOffset(1, 10_000, 56, 5)).toBe(4);
    expect(indexForOffset(2, 20, 56, 5)).toBe(2); // less than half a row: stays
  });

  it('sorts server items by position', () => {
    expect(
      orderedSymbols([
        {symbol: 'B', position: 2},
        {symbol: 'A', position: 0},
        {symbol: 'C', position: 1},
      ]),
    ).toEqual(['A', 'C', 'B']);
  });

  it('commits the full reordered symbol list exactly once for a drag from i to j', () => {
    const commit = jest.fn();
    const next = finishDrag(order, 1, 56 * 2, 56, commit);
    expect(next).toEqual(['RELIANCE', 'INFY', 'HDFCBANK', 'TCS', 'ITC']);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(['RELIANCE', 'INFY', 'HDFCBANK', 'TCS', 'ITC']);
  });

  it('does not commit no-op drops', () => {
    const commit = jest.fn();
    expect(finishDrag(order, 2, 12, 56, commit)).toEqual(order);
    expect(finishDrag(order, 0, -300, 56, commit)).toEqual(order);
    expect(commitIfChanged(order, [...order], commit)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
});
