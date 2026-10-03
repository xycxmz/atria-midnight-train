import { describe, expect, it } from 'vitest';
import seed from '../fixtures/case.seed.json';
import { evaluateVerdict, type VerdictSpec, type VerdictSubmission } from '../../src/domain/verdict';
import type { SpotClaim } from '../../src/domain/constraints';
import type { TravelEdge } from '../../src/domain/route';

const EDGES: TravelEdge[] = seed.edges.map((edge) => ({ ...edge }));
const ANCHORS: SpotClaim[] = seed.objectiveAnchors.map((a) => ({
  person: a.person,
  location: a.location,
  t: a.t,
  evidence: a.evidence,
  kind: 'record' as const,
}));

const SPEC: VerdictSpec = {
  actor: seed.verdict.actor,
  eventT: seed.verdict.eventT,
  eventLocation: seed.verdict.eventLocation,
  object: '黄铜星图盘',
  stash: seed.verdict.stash,
  slots: [
    { id: 'object-time', label: '对象与时刻', requiredEvidence: ['E01', 'E02', 'E07'] },
    { id: 'person', label: '人物', requiredEvidence: ['E03', 'E04', 'E05', 'E06', 'E08'] },
    { id: 'testimony', label: '证词问题', requiredEvidence: ['E03', 'E09'] },
    { id: 'stash', label: '地点与找回', requiredEvidence: ['E01', 'E11', 'E12'] },
  ],
  optionalEvidence: seed.verdict.optionalEvidence,
};

const ALL_EVIDENCE: string[] = [...seed.evidenceIds];

const build = (overrides: Partial<VerdictSubmission> = {}): VerdictSubmission => ({
  person: 'su',
  eventLocation: 'L',
  eventT: 150,
  object: '黄铜星图盘',
  stash: 'D-service-compartment',
  selectedEvidence: [...ALL_EVIDENCE],
  discoveredEvidence: [...ALL_EVIDENCE],
  objectiveAnchors: ANCHORS,
  edges: EDGES,
  ...overrides,
});

describe('A-T08 正确人物、时刻、地点与全部必需语义证据组', () => {
  it('结案成功', () => {
    const result = evaluateVerdict(SPEC, build());
    expect(result.solved).toBe(true);
    expect(result.slots).toHaveLength(4);
    expect(result.slots.every((slot) => slot.supported)).toBe(true);
  });
});

describe('A-T09 未发现 E10 但具备全部必需语义组', () => {
  it('仍然成功', () => {
    const withoutE10 = ALL_EVIDENCE.filter((id) => id !== 'E10');
    const result = evaluateVerdict(
      SPEC,
      build({ selectedEvidence: withoutE10, discoveredEvidence: withoutE10 }),
    );
    expect(result.solved).toBe(true);
  });
});

describe('A-T10 缺少单条必需证据分别提交', () => {
  it('缺 E07 时对象与时刻不足', () => {
    const result = evaluateVerdict(SPEC, build({ selectedEvidence: ALL_EVIDENCE.filter((id) => id !== 'E07') }));
    expect(result.solved).toBe(false);
    expect(result.slots.find((slot) => slot.slotId === 'object-time')?.supported).toBe(false);
  });
  it('缺 E08 时人物槽不足', () => {
    const result = evaluateVerdict(SPEC, build({ selectedEvidence: ALL_EVIDENCE.filter((id) => id !== 'E08') }));
    expect(result.solved).toBe(false);
    expect(result.slots.find((slot) => slot.slotId === 'person')?.supported).toBe(false);
  });
  it('缺 E12 时地点与找回不足', () => {
    const result = evaluateVerdict(SPEC, build({ selectedEvidence: ALL_EVIDENCE.filter((id) => id !== 'E12') }));
    expect(result.solved).toBe(false);
    expect(result.slots.find((slot) => slot.slotId === 'stash')?.supported).toBe(false);
  });
});

describe('A-T11 错误提交不通过且不泄露答案', () => {
  it('错人物但证据齐全不得成功', () => {
    const result = evaluateVerdict(SPEC, build({ person: 'lin' }));
    expect(result.solved).toBe(false);
    const feedback = result.slots.map((slot) => slot.reason).join(' ');
    expect(feedback).not.toMatch(/苏/);
    expect(result.slots.find((slot) => slot.slotId === 'person')?.supported).toBe(false);
  });
  it('正确人名但只选两张卡不得成功', () => {
    const result = evaluateVerdict(SPEC, build({ selectedEvidence: ['E01', 'E03'] }));
    expect(result.solved).toBe(false);
    const unsupported = result.slots.filter((slot) => !slot.supported).map((slot) => slot.slotId);
    expect(unsupported).toEqual(['object-time', 'person', 'testimony', 'stash']);
  });
  it('时刻错误与证据缺失都只给出待补充式反馈', () => {
    const wrongTime = evaluateVerdict(SPEC, build({ eventT: 210 }));
    expect(wrongTime.solved).toBe(false);
    expect(wrongTime.slots.find((slot) => slot.slotId === 'object-time')?.supported).toBe(false);
  });
});

describe('A-T12 重复 ID 与乱序不影响判定', () => {
  const canonical = evaluateVerdict(SPEC, build());
  it('重复选择同一证据不刷进度', () => {
    const duplicated = evaluateVerdict(
      SPEC,
      build({ selectedEvidence: [...ALL_EVIDENCE, 'E03', 'E09', 'E12'] }),
    );
    expect(duplicated.solved).toBe(canonical.solved);
    expect(duplicated.slots.map((slot) => slot.supported)).toEqual(
      canonical.slots.map((slot) => slot.supported),
    );
  });
  it('证据顺序打乱结果不变', () => {
    const shuffled = evaluateVerdict(
      SPEC,
      build({ selectedEvidence: [...ALL_EVIDENCE].reverse() }),
    );
    expect(shuffled.solved).toBe(canonical.solved);
  });
});
