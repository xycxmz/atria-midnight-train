// 车厢通行领域：依据相邻车厢边计算最短通行秒数与跳数。
// 边是无向的：S 到 D 与 D 到 S 耗时相同。规则适用于所有人物，没有外部路线。

export interface TravelEdge {
  from: string;
  to: string;
  seconds: number;
}

export class NoRouteError extends Error {
  constructor(from: string, to: string) {
    super(`从 ${from} 到 ${to} 没有可通行的车厢路线。`);
    this.name = 'NoRouteError';
  }
}

interface RouteNode {
  seconds: number;
  hops: number;
}

// Bellman-Ford：图极小，直接松弛所有边；同时维护最短路径跳数，正确处理并行边。
const computeRoute = (from: string, to: string, edges: TravelEdge[]): RouteNode => {
  if (from === to) return { seconds: 0, hops: 0 };
  const dist = new Map<string, number>([[from, 0]]);
  const hops = new Map<string, number>([[from, 0]]);
  for (let pass = 0; pass < edges.length; pass += 1) {
    for (const edge of edges) {
      relax(dist, hops, edge.from, edge.to, edge.seconds);
      relax(dist, hops, edge.to, edge.from, edge.seconds);
    }
  }
  const distance = dist.get(to);
  if (distance === undefined) throw new NoRouteError(from, to);
  return { seconds: distance, hops: hops.get(to) as number };
};

const relax = (
  dist: Map<string, number>,
  hops: Map<string, number>,
  from: string,
  to: string,
  weight: number,
): void => {
  const fromDist = dist.get(from);
  if (fromDist === undefined) return;
  const toDist = dist.get(to);
  if (toDist === undefined || fromDist + weight < toDist) {
    dist.set(to, fromDist + weight);
    hops.set(to, (hops.get(from) as number) + 1);
  }
};

export const shortestTravel = (from: string, to: string, edges: TravelEdge[]): number =>
  computeRoute(from, to, edges).seconds;

export const hopCount = (from: string, to: string, edges: TravelEdge[]): number =>
  computeRoute(from, to, edges).hops;
