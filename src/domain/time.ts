// 案件时间领域：统一相对秒 t，t=0 对应起点（本案为前一天 23:56:00）。
// 跨午夜只在此模块内部处理，外部一律使用相对秒。

export interface TimeOfDay {
  hours: number;
  minutes: number;
  seconds: number;
}

export type ParseFailReason = 'format' | 'range' | 'window';

export type ParseResult =
  | { ok: true; t: number }
  | { ok: false; reason: ParseFailReason; message: string };

export const SECONDS_PER_DAY = 86400;

export const parseClock = (label: string): TimeOfDay | { invalid: 'format' | 'range' } => {
  const match = /^\s*(\d{1,2}):(\d{2}):(\d{2})\s*$/.exec(label ?? '');
  if (!match) return { invalid: 'format' };
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return { invalid: 'range' };
  return { hours, minutes, seconds };
};

export const toAbsoluteSeconds = (clock: TimeOfDay): number =>
  clock.hours * 3600 + clock.minutes * 60 + clock.seconds;

export const toClock = (t: number, origin: TimeOfDay): TimeOfDay => {
  const absolute = (toAbsoluteSeconds(origin) + t) % SECONDS_PER_DAY;
  return {
    hours: Math.floor(absolute / 3600),
    minutes: Math.floor((absolute % 3600) / 60),
    seconds: absolute % 60,
  };
};

export const pad2 = (value: number): string => String(value).padStart(2, '0');

export const formatClock = (clock: TimeOfDay): string =>
  `${pad2(clock.hours)}:${pad2(clock.minutes)}:${pad2(clock.seconds)}`;

export const formatRelative = (t: number, origin: TimeOfDay): string =>
  formatClock(toClock(t, origin));

export const parseRelative = (
  label: string,
  origin: TimeOfDay,
  durationSeconds: number,
): ParseResult => {
  const clock = parseClock(label);
  if ('invalid' in clock) {
    return {
      ok: false,
      reason: clock.invalid,
      message:
        clock.invalid === 'format'
          ? '时间请写成 时:分:秒，例如 23:58:30。'
          : '时、分、秒超出钟面范围，请检查输入。',
    };
  }
  const diff =
    (((toAbsoluteSeconds(clock) - toAbsoluteSeconds(origin)) % SECONDS_PER_DAY) +
      SECONDS_PER_DAY) %
    SECONDS_PER_DAY;
  if (diff > durationSeconds) {
    return {
      ok: false,
      reason: 'window',
      message: `时间需要位于 ${formatClock(origin)} 起的案件窗口内。`,
    };
  }
  return { ok: true, t: diff };
};

export const snapToGrid = (t: number, step = 15): number =>
  Math.round(t / step) * step;

export const clampToWindow = (t: number, durationSeconds: number): number =>
  Math.max(0, Math.min(durationSeconds, t));
