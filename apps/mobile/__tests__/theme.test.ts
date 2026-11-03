import fs from 'fs';
import path from 'path';
import {darkPalette, FONTS, lightPalette, rgb, TOKEN_NAMES, tokens} from '../src/theme';
import {SOURCE_LABEL} from '../src/components/Badge';

const ROOT = path.resolve(__dirname, '..');
const GLOBALS = path.resolve(ROOT, '../web/src/app/globals.css');

/** Parses `--name: r g b;` triplets from one CSS block of the web's globals.css. */
function parseBlock(css: string, selector: RegExp): Record<string, number[]> {
  const m = css.match(selector);
  if (!m) {
    throw new Error(`block ${selector} not found`);
  }
  const out: Record<string, number[]> = {};
  for (const line of m[1].matchAll(/--([a-z]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    out[line[1]] = [Number(line[2]), Number(line[3]), Number(line[4])];
  }
  return out;
}

describe('design tokens match the web (apps/web/src/app/globals.css)', () => {
  const css = fs.readFileSync(GLOBALS, 'utf8');
  const dark = parseBlock(css, /:root,\s*\.dark\s*\{([^}]*)\}/);
  const light = parseBlock(css, /\.light\s*\{([^}]*)\}/);

  it('has every token in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual([...TOKEN_NAMES].sort());
    expect(Object.keys(light).sort()).toEqual([...TOKEN_NAMES].sort());
  });

  it.each(TOKEN_NAMES)('dark %s equals the web value', name => {
    expect([...tokens.dark[name]]).toEqual(dark[name]);
    expect(darkPalette[name]).toBe(rgb(tokens.dark[name]));
  });

  it.each(TOKEN_NAMES)('light %s equals the web value', name => {
    expect([...tokens.light[name]]).toEqual(light[name]);
    expect(lightPalette[name]).toBe(rgb(tokens.light[name]));
  });

  it('pins the headline dark values from the brief', () => {
    expect(darkPalette.ground).toBe('rgb(11, 12, 14)'); // #0B0C0E
    expect(darkPalette.surface).toBe('rgb(19, 20, 23)'); // #131417
    expect(darkPalette.raised).toBe('rgb(27, 29, 33)'); // #1B1D21
    expect(darkPalette.accent).toBe('rgb(242, 166, 58)'); // saffron
    expect(darkPalette.up).toBe('rgb(16, 185, 129)');
    expect(darkPalette.down).toBe('rgb(240, 82, 82)');
  });

  it('text on an ink-filled primary button is the ground colour (web variant=primary)', () => {
    expect(darkPalette.onAccent).toBe(darkPalette.ground);
    expect(lightPalette.onAccent).toBe(lightPalette.ground);
  });
});

describe('fonts are the web families and are linked', () => {
  it('maps every weight to an explicit family name', () => {
    expect(FONTS.sans).toEqual({
      '400': 'PublicSans-Regular',
      '500': 'PublicSans-Medium',
      '600': 'PublicSans-SemiBold',
      '700': 'PublicSans-Bold',
    });
    expect(FONTS.num['400']).toBe('JetBrainsMono-Regular');
    expect(FONTS.num['500']).toBe('JetBrainsMono-Medium');
    expect(FONTS.num['600']).toBe('JetBrainsMono-SemiBold');
  });

  it('ships every TTF with its OFL licence and declares the asset folder', () => {
    const dir = path.join(ROOT, 'assets/fonts');
    const families = [...new Set([...Object.values(FONTS.sans), ...Object.values(FONTS.num)])];
    for (const f of families) {
      expect(fs.existsSync(path.join(dir, `${f}.ttf`))).toBe(true);
    }
    expect(fs.existsSync(path.join(dir, 'PublicSans-OFL.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'JetBrainsMono-OFL.txt'))).toBe(true);
    const rn = require('../react-native.config.js');
    expect(rn.assets).toContain('./assets/fonts');
  });
});

describe('source badge labels match the web', () => {
  it('uses the same wording', () => {
    expect(SOURCE_LABEL).toEqual({
      HISTORICAL_DATASET: 'Historical dataset',
      SIMULATED: 'Simulated data',
      PAPER_TRADING: 'Paper trading',
      DEMO_ANALYSIS: 'Demo analysis',
    });
  });
});
