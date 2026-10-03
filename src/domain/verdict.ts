// 结案领域：四个结构化槽位的语义证据组判定。
// 只依据玩家提交的选择与已发现的证据；反馈指出哪一项尚未得到所选证据支持，
// 不直接给出正确人名或答案。正确人名但证据不足只得到“待补充”。

import { checkEventFeasibility, type SpotClaim } from './constraints';
import type { TravelEdge } from './route';

export interface VerdictSlotSpec {
  id: string;
  label: string;
  requiredEvidence: string[];
}

export interface VerdictSpec {
  actor: string;
  eventT: number;
  eventLocation: string;
  object: string;
  stash: string;
  slots: VerdictSlotSpec[];
  optionalEvidence: string[];
}

export interface VerdictSubmission {
  person: string;
  eventLocation: string;
  eventT: number;
  object: string;
  stash: string;
  selectedEvidence: string[];
  discoveredEvidence: string[];
  objectiveAnchors: SpotClaim[];
  edges: TravelEdge[];
}

export interface SlotVerdict {
  slotId: string;
  label: string;
  supported: boolean;
  reason: string;
}

export interface VerdictResult {
  solved: boolean;
  slots: SlotVerdict[];
}

export const dedupeIds = (ids: string[]): string[] => [...new Set(ids)];

const includesAll = (selected: string[], required: string[]): boolean =>
  required.every((id) => selected.includes(id));

export const evaluateVerdict = (
  spec: VerdictSpec,
  submission: VerdictSubmission,
): VerdictResult => {
  const selected = dedupeIds(
    submission.selectedEvidence.filter((id) => submission.discoveredEvidence.includes(id)),
  );
  const anchorsInPlay = submission.objectiveAnchors.filter(
    (anchor) => anchor.evidence === undefined || selected.includes(anchor.evidence),
  );

  const slots: SlotVerdict[] = spec.slots.map((slot) => {
    const groupOk = includesAll(selected, slot.requiredEvidence);
    if (slot.id === 'object-time') {
      if (!groupOk) {
        return slotVerdict(slot, false, '所选证据尚未覆盖“对象与时刻”所需的全部记录。');
      }
      if (selected.includes('E07') && submission.eventT !== spec.eventT) {
        return slotVerdict(slot, false, '所选时刻与展匣开启条记录的唯一开启时刻不一致。');
      }
      if (selected.includes('E07') && submission.eventLocation !== spec.eventLocation) {
        return slotVerdict(slot, false, '所选地点与展匣开启条记录的地点不一致。');
      }
      if (selected.includes('E01') && submission.object !== spec.object) {
        return slotVerdict(slot, false, '所选对象与委托封存单记录的物件不一致。');
      }
      return slotVerdict(slot, true, '对象、地点与时刻均得到所选记录支持。');
    }

    if (slot.id === 'person') {
      if (!groupOk) {
        return slotVerdict(slot, false, '所选证据尚未覆盖排除与持有条件所需的全部记录。');
      }
      const feasibility = checkEventFeasibility(anchorsInPlay, {
        location: spec.eventLocation,
        t: spec.eventT,
      }, submission.edges);
      const entry = feasibility.perPerson.get(submission.person);
      if (entry && entry.excluded) {
        return slotVerdict(slot, false, '所选人物与你选中的可靠位置记录不相容。');
      }
      if (!entry) {
        return slotVerdict(slot, false, '所选人物没有可用的可靠位置记录可供核对。');
      }
      return slotVerdict(slot, true, '所选人物未被你选中的任何可靠位置记录排除。');
    }

    if (slot.id === 'testimony') {
      if (!groupOk) {
        return slotVerdict(slot, false, '所选证据尚未覆盖通行规则与该人物陈述所需的记录。');
      }
      return slotVerdict(slot, true, '已集齐通行表与该人物的两段陈述。');
    }

    if (slot.id === 'stash') {
      if (!groupOk) {
        return slotVerdict(slot, false, '所选证据尚未覆盖藏匿地点所需的全部记录。');
      }
      if (selected.includes('E11') && submission.stash !== spec.stash) {
        return slotVerdict(slot, false, '所选藏匿地点与检修格开合条记录的位置不一致。');
      }
      return slotVerdict(slot, true, '藏匿地点得到检修格记录与找回实物的支持。');
    }

    return slotVerdict(slot, false, '该结案槽位尚未配置。');
  });

  return {
    solved: slots.every((slot) => slot.supported),
    slots,
  };
};

const slotVerdict = (slot: VerdictSlotSpec, supported: boolean, reason: string): SlotVerdict => ({
  slotId: slot.id,
  label: slot.label,
  supported,
  reason,
});
