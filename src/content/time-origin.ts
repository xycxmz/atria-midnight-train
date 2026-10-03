// 案件时间显示绑定：把领域时间函数接到 case-001 的起点与窗口。
import { formatRelative, parseRelative, snapToGrid, clampToWindow } from '../domain/time';
import { DURATION_SECONDS, TIME_ORIGIN } from './case-001';

export { TIME_ORIGIN, DURATION_SECONDS };

export const formatT = (t: number): string => formatRelative(t, TIME_ORIGIN);

export const parseT = (label: string) => parseRelative(label, TIME_ORIGIN, DURATION_SECONDS);

export const snapT = (t: number, step = 15): number =>
  clampToWindow(snapToGrid(t, step), DURATION_SECONDS);
