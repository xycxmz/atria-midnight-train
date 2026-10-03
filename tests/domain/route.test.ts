import { describe, expect, it } from 'vitest';
import { hopCount, NoRouteError, shortestTravel, type TravelEdge } from '../../src/domain/route';

const EDGES: TravelEdge[] = [
  { from: 'S', to: 'D', seconds: 75 },
  { from: 'D', to: 'L', seconds: 75 },
];

describe('A-T03 车厢最短通行时间', () => {
  it('S 到 L 为 150 秒', () => {
    expect(shortestTravel('S', 'L', EDGES)).toBe(150);
  });
  it('L 到 S 同样为 150 秒', () => {
    expect(shortestTravel('L', 'S', EDGES)).toBe(150);
  });
  it('同地点为 0 秒', () => {
    expect(shortestTravel('S', 'S', EDGES)).toBe(0);
    expect(shortestTravel('D', 'D', EDGES)).toBe(0);
  });
  it('相邻车厢单程 75 秒，双向一致', () => {
    expect(shortestTravel('S', 'D', EDGES)).toBe(75);
    expect(shortestTravel('D', 'S', EDGES)).toBe(75);
    expect(shortestTravel('D', 'L', EDGES)).toBe(75);
    expect(shortestTravel('L', 'D', EDGES)).toBe(75);
  });
  it('跳数与步行段一致', () => {
    expect(hopCount('S', 'L', EDGES)).toBe(2);
    expect(hopCount('L', 'S', EDGES)).toBe(2);
    expect(hopCount('S', 'D', EDGES)).toBe(1);
  });
  it('未介绍的位置无路线', () => {
    expect(() => shortestTravel('S', 'X', EDGES)).toThrow(NoRouteError);
  });
});
