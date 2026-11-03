import {Platform, type TextStyle} from 'react-native';
import {useThemeStore} from '../store/theme';

/**
 * QuantDesk tokens — "data terminal": colour lives on data, chrome stays neutral.
 * These are the exact RGB channels of apps/web/src/app/globals.css (`:root, .dark` and `.light`).
 * __tests__/theme.test.ts parses globals.css and fails if the two drift apart.
 */
export type ThemeMode = 'dark' | 'light';
export type Rgb = readonly [number, number, number];

export const TOKEN_NAMES = [
  'ground',
  'surface',
  'raised',
  'line',
  'rule',
  'ink',
  'muted',
  'faint',
  'accent',
  'up',
  'down',
  'warn',
  'info',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

export const tokens: Record<ThemeMode, Record<TokenName, Rgb>> = {
  dark: {
    ground: [11, 12, 14], // #0B0C0E deep charcoal page
    surface: [19, 20, 23], // #131417 panels
    raised: [27, 29, 33], // #1B1D21 hover / controls
    line: [38, 40, 45], // panel edges
    rule: [30, 32, 36], // row rules
    ink: [242, 243, 245],
    muted: [142, 145, 152],
    faint: [98, 101, 108],
    accent: [242, 166, 58], // saffron: the selection line
    up: [16, 185, 129], // emerald
    down: [240, 82, 82],
    warn: [217, 164, 65],
    info: [96, 155, 230],
  },
  light: {
    ground: [244, 245, 247],
    surface: [255, 255, 255],
    raised: [240, 241, 244],
    line: [224, 226, 231],
    rule: [236, 237, 240],
    ink: [13, 15, 18],
    muted: [88, 92, 100],
    faint: [140, 144, 152],
    accent: [196, 112, 4],
    up: [4, 140, 98],
    down: [214, 40, 40],
    warn: [176, 116, 16],
    info: [37, 99, 200],
  },
};

export const rgb = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
export const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

/** Applies alpha to any palette colour ("rgb(r, g, b)" or "#rrggbb"), like Tailwind's `bg-up/12`. */
export function alpha(color: string, a: number): string {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
  }
  const h = color.replace('#', '');
  if (h.length === 6) {
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return color;
}

export interface Palette {
  mode: ThemeMode;
  // ---- web token names (use these in new code)
  ground: string;
  surface: string;
  raised: string;
  line: string;
  rule: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  up: string;
  down: string;
  warn: string;
  info: string;
  /** Text colour on buy/sell fills (white on both themes, like web `text-white`). */
  onFill: string;
  // ---- legacy aliases (kept so older code keeps compiling; they resolve to the web tokens)
  bg: string;
  surfaceAlt: string;
  elevated: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accentMuted: string;
  onAccent: string;
  gain: string;
  gainMuted: string;
  loss: string;
  lossMuted: string;
  warning: string;
  warningMuted: string;
  skeleton: string;
  skeletonHighlight: string;
  overlay: string;
  chartGrid: string;
  /** Overlay series colours — same list as web PriceChart OVERLAY_COLORS. */
  series: string[];
}

export const OVERLAY_COLORS = ['#F2A63A', '#609BE6', '#C084FC', '#2DD4BF', '#F472B6', '#A3E635'];

function build(mode: ThemeMode): Palette {
  const t = tokens[mode];
  const c = (k: TokenName) => rgb(t[k]);
  return {
    mode,
    ground: c('ground'),
    surface: c('surface'),
    raised: c('raised'),
    line: c('line'),
    rule: c('rule'),
    ink: c('ink'),
    muted: c('muted'),
    faint: c('faint'),
    accent: c('accent'),
    up: c('up'),
    down: c('down'),
    warn: c('warn'),
    info: c('info'),
    onFill: '#FFFFFF',
    bg: c('ground'),
    surfaceAlt: c('raised'),
    elevated: c('raised'),
    border: c('line'),
    borderStrong: c('faint'),
    text: c('ink'),
    textMuted: c('muted'),
    textFaint: c('faint'),
    accentMuted: rgba(t.accent, 0.12),
    onAccent: c('ground'),
    gain: c('up'),
    gainMuted: rgba(t.up, 0.12),
    loss: c('down'),
    lossMuted: rgba(t.down, 0.12),
    warning: c('warn'),
    warningMuted: rgba(t.warn, 0.12),
    skeleton: c('raised'),
    skeletonHighlight: rgba(t.line, 0.7),
    overlay: mode === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(13, 15, 18, 0.4)',
    chartGrid: rgba(t.rule, 0.9),
    series: OVERLAY_COLORS,
  };
}

export const darkPalette: Palette = build('dark');
export const lightPalette: Palette = build('light');

export const spacing = {xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28};
/** Web: rounded-card 8px, rounded-ctl 6px. */
export const radius = {sm: 4, ctl: 6, md: 6, card: 8, lg: 8, xl: 12, pill: 999};

/**
 * Fonts — same families as the web: Public Sans (text) and JetBrains Mono (every figure).
 * Static TTFs live in assets/fonts and are linked with `npx react-native-asset`. Android resolves a
 * custom font by file name, so each weight is its own family name; fontWeight is never combined with it.
 */
export const FONTS = {
  sans: {
    '400': 'PublicSans-Regular',
    '500': 'PublicSans-Medium',
    '600': 'PublicSans-SemiBold',
    '700': 'PublicSans-Bold',
  },
  num: {
    '400': 'JetBrainsMono-Regular',
    '500': 'JetBrainsMono-Medium',
    '600': 'JetBrainsMono-SemiBold',
    '700': 'JetBrainsMono-SemiBold',
  },
} as const;

/** Set to false to fall back to the system fonts (e.g. if the TTFs are removed). */
export const CUSTOM_FONTS = true;

type W = '400' | '500' | '600' | '700';
function normWeight(w: TextStyle['fontWeight'] | undefined): W {
  const n = typeof w === 'number' ? w : w === 'bold' ? 700 : w === 'normal' || w === undefined ? 400 : Number(w) || 400;
  if (n >= 700) {
    return '700';
  }
  if (n >= 600) {
    return '600';
  }
  if (n >= 500) {
    return '500';
  }
  return '400';
}

/** Resolves {fontFamily} (and fontWeight only for system-font fallback) for a weight. */
export function fontFor(weight: TextStyle['fontWeight'] | undefined, num = false): TextStyle {
  const w = normWeight(weight);
  if (!CUSTOM_FONTS) {
    return {fontWeight: w, ...(num ? {fontVariant: ['tabular-nums']} : null)};
  }
  return {
    fontFamily: (num ? FONTS.num : FONTS.sans)[w],
    fontWeight: Platform.OS === 'ios' ? undefined : 'normal',
    ...(num ? {fontVariant: ['tabular-nums']} : null),
  };
}

/** Type scale (web: 2xs 11/16, xs 12/16, sm 13/20, base 14/22, page title 22 semibold -0.02em). */
export const type = {
  display: {fontSize: 30, lineHeight: 36, letterSpacing: -0.6, fontWeight: '500'} as TextStyle,
  h1: {fontSize: 22, lineHeight: 28, letterSpacing: -0.44, fontWeight: '600'} as TextStyle,
  h2: {fontSize: 17, lineHeight: 24, letterSpacing: -0.2, fontWeight: '600'} as TextStyle,
  h3: {fontSize: 14, lineHeight: 20, fontWeight: '600'} as TextStyle,
  title: {fontSize: 13, lineHeight: 18, fontWeight: '600'} as TextStyle,
  body: {fontSize: 14, lineHeight: 21, fontWeight: '400'} as TextStyle,
  small: {fontSize: 13, lineHeight: 19, fontWeight: '400'} as TextStyle,
  caption: {fontSize: 12, lineHeight: 16, fontWeight: '400'} as TextStyle,
  micro: {fontSize: 11, lineHeight: 15, fontWeight: '400'} as TextStyle,
  /** Prices & quantities: JetBrains Mono, tabular, -0.02em like web `.num`. */
  num: {fontVariant: ['tabular-nums']} as TextStyle,
};

export function usePalette(): Palette {
  const mode = useThemeStore(s => s.mode);
  return mode === 'light' ? lightPalette : darkPalette;
}

/** Web `toneClass`: up / down / muted by sign. */
export function changeColor(p: Palette, v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0 || Number.isNaN(v)) {
    return p.muted;
  }
  return v > 0 ? p.up : p.down;
}
export const toneColor = changeColor;

/** Shared easing of the web motion language: cubic-bezier(0.16, 1, 0.3, 1). */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
