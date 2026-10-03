import { describe, expect, it } from 'vitest';
import {
  clampToWindow,
  formatRelative,
  parseClock,
  parseRelative,
  snapToGrid,
  toClock,
  type TimeOfDay,
} from '../../src/domain/time';

const ORIGIN: TimeOfDay = { hours: 23, minutes: 56, seconds: 0 };
const DURATION = 360;

describe('A-T01 解析与反向格式化跨午夜一致', () => {
  const cases: Array<[string, number]> = [
    ['23:56:00', 0],
    ['23:58:30', 150],
    ['00:00:00', 240],
    ['00:02:00', 360],
  ];
  it.each(cases)('解析 %s 得到 %i', (label, expected) => {
    const result = parseRelative(label, ORIGIN, DURATION);
    expect(result).toEqual({ ok: true, t: expected });
  });
  it.each(cases)('格式化 %i 秒得到 %s', (label, t) => {
    expect(formatRelative(t, ORIGIN)).toBe(label);
  });
  it('往返一致', () => {
    for (let t = 0; t <= DURATION; t += 7) {
      const label = formatRelative(t, ORIGIN);
      expect(parseRelative(label, ORIGIN, DURATION)).toEqual({ ok: true, t });
    }
  });
});

describe('A-T02 非法输入明确报错', () => {
  it('格式错误不成 0', () => {
    expect(parseRelative('1:2:3', ORIGIN, DURATION)).toMatchObject({ ok: false, reason: 'format' });
    expect(parseRelative('', ORIGIN, DURATION)).toMatchObject({ ok: false, reason: 'format' });
    expect(parseRelative('235830', ORIGIN, DURATION)).toMatchObject({ ok: false, reason: 'format' });
  });
  it('越界不成有效证据', () => {
    expect(parseRelative('25:00:00', ORIGIN, DURATION)).toMatchObject({ ok: false, reason: 'range' });
    expect(parseRelative('23:60:00', ORIGIN, DURATION)).toMatchObject({ ok: false, reason: 'range' });
  });
  it('窗口外不成 0', () => {
    expect(parseRelative('23:50:00', ORIGIN, DURATION)).toMatchObject({ ok: false, reason: 'window' });
    expect(parseRelative('00:05:00', ORIGIN, DURATION)).toMatchObject({ ok: false, reason: 'window' });
  });
  it('错误结果不携带 t', () => {
    const bad = parseRelative('99:99:99', ORIGIN, DURATION);
    expect(bad.ok).toBe(false);
    expect(bad).not.toHaveProperty('t');
  });
});

describe('parseClock 与 toClock 单元行为', () => {
  it('parseClock 接受合法钟面', () => {
    expect(parseClock('23:58:30')).toEqual({ hours: 23, minutes: 58, seconds: 30 });
    expect(parseClock(' 00:00:00 ')).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
  it('toClock 跨午夜回绕', () => {
    expect(toClock(240, ORIGIN)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(toClock(360, ORIGIN)).toEqual({ hours: 0, minutes: 2, seconds: 0 });
  });
});

describe('吸附与钳制', () => {
  it('15 秒吸附', () => {
    expect(snapToGrid(151)).toBe(150);
    expect(snapToGrid(158)).toBe(165);
    expect(snapToGrid(300)).toBe(300);
  });
  it('钳制不越窗口', () => {
    expect(clampToWindow(500, DURATION)).toBe(360);
    expect(clampToWindow(-20, DURATION)).toBe(0);
  });
});
