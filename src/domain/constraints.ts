// 约束领域：对照两条时空声称，以及把可靠位置记录与固定事件逐人比较。
// 本模块只做时空算术，不指认嫌疑人；是否排除由具体记录与通行规则决定。

import { hopCount, shortestTravel, type TravelEdge } from './route';

export type ClaimKind = 'record' | 'testimony' | 'hypothesis';

export interface SpotClaim {
  person: string;
  location: string;
  t: number;
  evidence?: string;
  kind: ClaimKind;
}

export interface CaseEvent {
  location: string;
  t: number;
}

export interface ComparisonResult {
  earlier: SpotClaim;
  later: SpotClaim;
  sameSubject: boolean;
  hops: number;
  travelSeconds: number;
  availableSeconds: number;
  shortfallSeconds: number;
  possible: boolean;
}

export const compareClaims = (
  a: SpotClaim,
  b: SpotClaim,
  edges: TravelEdge[],
): ComparisonResult => {
  const [earlier, later] = a.t <= b.t ? [a, b] : [b, a];
  const availableSeconds = later.t - earlier.t;
  const travelSeconds = shortestTravel(earlier.location, later.location, edges);
  const shortfallSeconds = Math.max(0, travelSeconds - availableSeconds);
  return {
    earlier,
    later,
    sameSubject: a.person === b.person,
    hops: hopCount(earlier.location, later.location, edges),
    travelSeconds,
    availableSeconds,
    shortfallSeconds,
    possible: shortfallSeconds <= 0,
  };
};

export interface AnchorVerdict {
  person: string;
  location: string;
  t: number;
  evidence?: string;
  availableSeconds: number;
  requiredSeconds: number;
  compatible: boolean;
}

export interface PersonFeasibility {
  person: string;
  /** 无可靠记录时不参与排除（既不排除也不证实） */
  excluded: boolean;
  unknown: boolean;
  anchors: AnchorVerdict[];
  /** 排除理由：第一条不相容记录（供回顾引用） */
  exclusionReason: AnchorVerdict | null;
}

export interface FeasibilityReport {
  event: CaseEvent;
  perPerson: Map<string, PersonFeasibility>;
}

export const checkEventFeasibility = (
  objectiveAnchors: SpotClaim[],
  event: CaseEvent,
  edges: TravelEdge[],
): FeasibilityReport => {
  const perPerson = new Map<string, PersonFeasibility>();
  for (const anchor of objectiveAnchors) {
    const availableSeconds = Math.abs(anchor.t - event.t);
    const requiredSeconds = shortestTravel(anchor.location, event.location, edges);
    const verdict: AnchorVerdict = {
      person: anchor.person,
      location: anchor.location,
      t: anchor.t,
      evidence: anchor.evidence,
      availableSeconds,
      requiredSeconds,
      compatible: requiredSeconds <= availableSeconds,
    };
    const entry = perPerson.get(anchor.person) ?? {
      person: anchor.person,
      excluded: false,
      unknown: false,
      anchors: [],
      exclusionReason: null,
    };
    entry.anchors.push(verdict);
    // 任一可靠记录与事件不相容即排除；后续记录不能“撤销”已成立的不可能。
    if (!verdict.compatible && !entry.excluded) {
      entry.excluded = true;
      entry.exclusionReason = verdict;
    }
    perPerson.set(anchor.person, entry);
  }
  for (const entry of perPerson.values()) {
    entry.unknown = entry.anchors.length === 0;
  }
  return { event, perPerson };
};

export const objectiveRecords = (claims: SpotClaim[]): SpotClaim[] =>
  claims.filter((claim) => claim.kind === 'record');

export const remainingSuspects = (report: FeasibilityReport): string[] =>
  [...report.perPerson.values()].filter((entry) => !entry.excluded).map((entry) => entry.person);

// 单条人物记录对固定事件（如展匣开启）的可行性：供玩家主动做“他能否赶到”的排除。
export const checkRecordAgainstEvent = (
  record: SpotClaim,
  event: CaseEvent,
  edges: TravelEdge[],
): AnchorVerdict => {
  const availableSeconds = Math.abs(record.t - event.t);
  const requiredSeconds = shortestTravel(record.location, event.location, edges);
  return {
    person: record.person,
    location: record.location,
    t: record.t,
    evidence: record.evidence,
    availableSeconds,
    requiredSeconds,
    compatible: requiredSeconds <= availableSeconds,
  };
};
