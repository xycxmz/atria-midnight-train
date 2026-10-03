import { describe, expect, it } from 'vitest';
import seed from '../fixtures/case.seed.json';
import {
  checkEventFeasibility,
  checkRecordAgainstEvent,
  compareClaims,
  objectiveRecords,
  remainingSuspects,
  type SpotClaim,
} from '../../src/domain/constraints';
import type { TravelEdge } from '../../src/domain/route';

const EDGES: TravelEdge[] = seed.edges.map((edge) => ({ ...edge }));

const claim = (person: string, location: string, t: number, evidence?: string, kind: SpotClaim['kind'] = 'record'): SpotClaim => ({
  person,
  location,
  t,
  evidence,
  kind,
});

describe('A-T04 E09 的 L210 到 D240 相互矛盾', () => {
  const result = compareClaims(
    claim('su', 'L', 210, 'E09', 'testimony'),
    claim('su', 'D', 240, 'E09', 'testimony'),
    EDGES,
  );
  it('最短需要 75 秒', () => {
    expect(result.travelSeconds).toBe(75);
    expect(result.hops).toBe(1);
  });
  it('可用时间只有 30 秒', () => {
    expect(result.availableSeconds).toBe(30);
  });
  it('缺少 45 秒且不可能同时成立', () => {
    expect(result.shortfallSeconds).toBe(45);
    expect(result.possible).toBe(false);
  });
});

describe('A-T05 玩家假设改到达时刻为 t=285', () => {
  const result = compareClaims(
    claim('su', 'L', 210, undefined, 'hypothesis'),
    claim('su', 'D', 285, undefined, 'hypothesis'),
    EDGES,
  );
  it('不再判为时间不足', () => {
    expect(result.possible).toBe(true);
    expect(result.shortfallSeconds).toBe(0);
  });
  it('假设仍标记为假设，不变成真实记录', () => {
    expect(result.earlier.kind).toBe('hypothesis');
    expect(result.later.kind).toBe('hypothesis');
  });
});

describe('A-T06 可靠锚点与 L150 事件逐人比较', () => {
  const anchors: SpotClaim[] = seed.objectiveAnchors.map((a) =>
    claim(a.person, a.location, a.t, a.evidence),
  );
  const report = checkEventFeasibility(anchors, seed.event, EDGES);
  it('林澈被排除', () => {
    expect(report.perPerson.get('lin')?.excluded).toBe(true);
  });
  it('周岚被排除（两条服务单均不相容）', () => {
    const zhou = report.perPerson.get('zhou');
    expect(zhou?.excluded).toBe(true);
    expect(zhou?.anchors).toHaveLength(2);
  });
  it('何川被排除', () => {
    expect(report.perPerson.get('he')?.excluded).toBe(true);
  });
  it('苏砚不被排除', () => {
    expect(report.perPerson.get('su')?.excluded).toBe(false);
  });
  it('剩余未被排除者只有苏砚', () => {
    expect(remainingSuspects(report)).toEqual(['su']);
  });
  it('何川被排除', () => {
    expect(report.perPerson.get('he')?.excluded).toBe(true);
  });
  it('每个排除都给出具体所需与可用秒数', () => {
    const lin = report.perPerson.get('lin')?.anchors[0];
    expect(lin?.availableSeconds).toBe(15);
    expect(lin?.requiredSeconds).toBe(150);
    expect(lin?.compatible).toBe(false);
    const he = report.perPerson.get('he')?.anchors[0];
    expect(he?.availableSeconds).toBe(25);
    expect(he?.requiredSeconds).toBe(75);
  });
});

describe('TR-001 跨人物记录不构成行程矛盾（域层）', () => {
  it('E04 林澈与 E05 周岚的记录主体不同', () => {
    const result = compareClaims(
      claim('lin', 'S', 135, 'E04'),
      claim('zhou', 'D', 135, 'E05'),
      EDGES,
    );
    expect(result.sameSubject).toBe(false);
  });
  it('E04 与 E06 主体不同', () => {
    const result = compareClaims(claim('lin', 'S', 135, 'E04'), claim('he', 'D', 175, 'E06'), EDGES);
    expect(result.sameSubject).toBe(false);
  });
  it('E09 自身两段陈述主体相同', () => {
    const result = compareClaims(
      claim('su', 'L', 210, 'E09', 'testimony'),
      claim('su', 'D', 240, 'E09', 'testimony'),
      EDGES,
    );
    expect(result.sameSubject).toBe(true);
  });
  it('同人异地同秒不相容', () => {
    const result = compareClaims(claim('su', 'L', 200), claim('su', 'D', 200), EDGES);
    expect(result.possible).toBe(false);
    expect(result.availableSeconds).toBe(0);
    expect(result.travelSeconds).toBe(75);
  });
});

describe('记录对已确定事件的可行性（事件对照）', () => {
  it('林澈 S135 对 L150 事件：15 秒可用，需 150 秒', () => {
    const verdict = checkRecordAgainstEvent(
      claim('lin', 'S', 135, 'E04'),
      { location: 'L', t: 150 },
      EDGES,
    );
    expect(verdict.availableSeconds).toBe(15);
    expect(verdict.requiredSeconds).toBe(150);
    expect(verdict.compatible).toBe(false);
  });
  it('苏砚 L60 对 L150 事件兼容', () => {
    const verdict = checkRecordAgainstEvent(
      claim('su', 'L', 60, 'E08'),
      { location: 'L', t: 150 },
      EDGES,
    );
    expect(verdict.compatible).toBe(true);
  });
});

describe('TR-003 任一不相容记录即排除（OR 语义）', () => {
  it('混合兼容/不兼容锚点：不相容的一条足以排除', () => {
    const anchors: SpotClaim[] = [
      claim('lin', 'L', 300),
      claim('lin', 'S', 135, 'E04'),
    ];
    const report = checkEventFeasibility(anchors, seed.event, EDGES);
    expect(report.perPerson.get('lin')?.excluded).toBe(true);
    expect(report.perPerson.get('lin')?.anchors).toHaveLength(2);
  });
  it('顺序打乱后排除结论不变', () => {
    const reversed: SpotClaim[] = [
      claim('lin', 'S', 135, 'E04'),
      claim('lin', 'L', 300),
    ];
    const report = checkEventFeasibility(reversed, seed.event, EDGES);
    expect(report.perPerson.get('lin')?.excluded).toBe(true);
  });
  it('无可靠记录的人物不被排除而是未知', () => {
    const report = checkEventFeasibility([], seed.event, EDGES);
    expect(report.perPerson.size).toBe(0);
  });
  it('排除理由指向第一条不相容记录', () => {
    const report = checkEventFeasibility(
      [claim('lin', 'L', 300), claim('lin', 'S', 135, 'E04')],
      seed.event,
      EDGES,
    );
    const lin = report.perPerson.get('lin');
    expect(lin?.exclusionReason?.t).toBe(135);
    expect(lin?.exclusionReason?.compatible).toBe(false);
  });
});

describe('A-T07 证词不进入客观锚点集合', () => {
  const testimony: SpotClaim[] = seed.testimonyToCompare.map((c) =>
    claim(c.person, c.location, c.t, c.evidence, 'testimony'),
  );
  const witness: SpotClaim[] = seed.witnessAnchors.map((c) =>
    claim(c.person, c.location, c.t, c.evidence, 'testimony'),
  );
  const records: SpotClaim[] = seed.objectiveAnchors.map((a) =>
    claim(a.person, a.location, a.t, a.evidence),
  );
  it('E09 与 E10 被客观记录过滤器排除', () => {
    const filtered = objectiveRecords([...records, ...testimony, ...witness]);
    expect(filtered).toHaveLength(records.length);
    expect(filtered.map((c) => c.evidence)).not.toContain('E09');
    expect(filtered.map((c) => c.evidence)).not.toContain('E10');
  });
  it('混入证词后候选排除结果不变', () => {
    const mixed = objectiveRecords([...records, ...testimony, ...witness]);
    const report = checkEventFeasibility(mixed, seed.event, EDGES);
    expect(remainingSuspects(report)).toEqual(['su']);
  });
});
