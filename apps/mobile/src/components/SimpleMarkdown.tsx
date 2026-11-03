import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {fontFor, radius, usePalette} from '../theme';
import {Txt} from './Txt';

/** Splits "**bold**" and "`code`" spans into styled runs (web Markdown `inline`). No HTML, no links. */
function Inline({text}: {text: string}) {
  const p = usePalette();
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={[{color: p.ink}, fontFor('600')]}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={i} style={[styles.code, {backgroundColor: p.raised, color: p.ink}, fontFor('400', true)]}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </>
  );
}

const ROW_RE = /^\s*([-*]|\d+\.)\s/;

/**
 * Minimal, safe markdown — line-for-line port of web components/assistant/Markdown.tsx:
 * headings, bullets, numbered lists, tables, **bold**, `code`.
 */
export function SimpleMarkdown({source}: {source: string}) {
  const p = usePalette();
  const lines = (source ?? '').replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      const level = (line.match(/^#+/) ?? ['#'])[0].length;
      out.push(
        <Txt key={i} variant={level <= 2 ? 'body' : 'small'} weight="600" style={styles.heading} accessibilityRole="header">
          <Inline text={line.replace(/^#+\s/, '')} />
        </Txt>,
      );
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map(c => c.trim());
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) {
          rows.push(cells);
        }
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <ScrollView key={`t${i}`} horizontal showsHorizontalScrollIndicator={false} style={styles.tableWrap} testID="md-table">
          <View>
            {head ? (
              <View style={styles.tr}>
                {head.map((h, k) => (
                  <Txt key={k} variant="caption" tone="muted" align={k > 0 ? 'right' : 'left'} style={styles.cell}>
                    <Inline text={h} />
                  </Txt>
                ))}
              </View>
            ) : null}
            {body.map((r, k) => (
              <View key={k} style={[styles.tr, {borderTopColor: p.rule}, styles.trBody]}>
                {r.map((c, j) => (
                  <Txt key={j} variant="small" num={j > 0} align={j > 0 ? 'right' : 'left'} style={styles.cell}>
                    <Inline text={c} />
                  </Txt>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>,
      );
      continue;
    }
    if (ROW_RE.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && ROW_RE.test(lines[i])) {
        items.push(lines[i].replace(ROW_RE, ''));
        i++;
      }
      out.push(
        <View key={`l${i}`} style={styles.list}>
          {items.map((it, k) => (
            <View key={k} style={styles.li}>
              {ordered ? (
                <Txt variant="small" num tone="muted" style={styles.num}>
                  {k + 1}.
                </Txt>
              ) : (
                <View style={[styles.dot, {backgroundColor: p.faint}]} />
              )}
              <Txt variant="small" style={styles.flex}>
                <Inline text={it} />
              </Txt>
            </View>
          ))}
        </View>,
      );
      continue;
    }
    out.push(
      <Txt key={i} variant="small" style={styles.para}>
        <Inline text={line} />
      </Txt>,
    );
    i++;
  }
  return (
    <View testID="markdown" style={styles.root}>
      {out}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 4},
  heading: {marginTop: 10},
  para: {marginVertical: 3, lineHeight: 20},
  list: {gap: 4, marginVertical: 3},
  li: {flexDirection: 'row', gap: 8},
  dot: {width: 4, height: 4, borderRadius: 2, marginTop: 8},
  num: {width: 18},
  flex: {flex: 1, lineHeight: 20},
  code: {borderRadius: radius.sm, fontSize: 12},
  tableWrap: {marginVertical: 6},
  tr: {flexDirection: 'row'},
  trBody: {borderTopWidth: 1},
  cell: {minWidth: 92, paddingHorizontal: 8, paddingVertical: 8},
});
