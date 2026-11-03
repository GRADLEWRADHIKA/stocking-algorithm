import {splitSupertrend} from '../src/utils/supertrend';

const pts = (vals: number[]) => vals.map((v, i) => ({time: 1000 + i * 60, value: v}));

describe('splitSupertrend', () => {
  const value = pts([100, 101, 102, 110, 109, 108, 103, 104, 112]);
  const direction = pts([1, 1, 1, -1, -1, -1, 1, 1, -1]);
  const segs = splitSupertrend(value, direction);

  it('creates one segment per uninterrupted regime', () => {
    expect(segs.map(s => s.side)).toEqual([1, -1, 1, -1]);
    expect(segs.map(s => s.points.length)).toEqual([3, 3, 2, 1]);
  });

  it('never joins regimes: segments share no points and alternate side', () => {
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].side).not.toBe(segs[i - 1].side);
      const prevTimes = new Set(segs[i - 1].points.map(p => p.time));
      segs[i].points.forEach(p => expect(prevTimes.has(p.time)).toBe(false));
      // the next segment starts strictly after the previous ends — no bridging point
      expect(segs[i].points[0].time).toBeGreaterThan(segs[i - 1].points[segs[i - 1].points.length - 1].time);
    }
  });

  it('puts every point on the side its direction says', () => {
    const dir = new Map(direction.map(p => [p.time, p.value]));
    segs.forEach(s => s.points.forEach(p => expect(Math.sign(dir.get(p.time) as number)).toBe(s.side)));
    expect(segs.reduce((n, s) => n + s.points.length, 0)).toBe(value.length);
  });

  it('skips points without a direction and handles empty input', () => {
    const s = splitSupertrend(pts([1, 2, 3]), [{time: 1000, value: 1}, {time: 1120, value: 1}]);
    expect(s).toHaveLength(1);
    expect(s[0].points.map(p => p.value)).toEqual([1, 3]);
    expect(splitSupertrend(undefined, undefined)).toEqual([]);
  });
});
