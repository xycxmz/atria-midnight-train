// 玩家调查状态：已发现线索、笔记、假设、布置、筛选、游标与偏好。
// 领域逻辑放进 domain/，本文件只管理玩家状态与派生视图。

import { EVIDENCE, PEOPLE, SNAP_STEP, DURATION_SECONDS, objectiveAnchorsFromCase, testimonyClaimsFromCase } from '../content/case-001';
import type { EvidenceKind, LocationId, PersonId } from '../content/case-001';
import { clampToWindow, snapToGrid } from '../domain/time';
import type { SpotClaim } from '../domain/constraints';
import type { VerdictResult } from '../domain/verdict';

const snapToStep = (t: number): number =>
  clampToWindow(snapToGrid(t, SNAP_STEP), DURATION_SECONDS);

export type GamePhase = 'menu' | 'briefing' | 'investigating' | 'solved';
export type MapMode = 'investigate' | 'history';
export type CardKind = 'record' | 'testimony' | 'physical';

export interface HypothesisFragment {
  id: string;
  person: PersonId;
  from: { location: LocationId; t: number };
  to?: { location: LocationId; t: number };
  note?: string;
  /** 玩家明确选中为候选路线后才在历史图上模拟移动 */
  active?: boolean;
}

export interface Placement {
  id: string;
  cardKind: 'evidence' | 'hypothesis';
  refId: string;
  lane: PersonId;
  t: number;
}

export interface KnownClaimView {
  person: PersonId;
  location: LocationId;
  t: number;
  kind: SpotClaim['kind'];
  evidence?: string;
  label: string;
}

export interface PersonPositionView {
  person: PersonId;
  status: 'known' | 'unknown' | 'simulated';
  location?: LocationId;
  fromClaim?: KnownClaimView;
  toClaim?: KnownClaimView;
}

export interface VerdictDraft {
  person: string;
  eventLocation: string;
  eventT: number | null;
  timeLabel: string;
  object: string;
  stash: string;
  selectedEvidence: string[];
}

export interface ReasoningNote {
  id: string;
  mode: 'trip' | 'event' | 'cross';
  labelA: string;
  labelB: string;
  evidenceA?: string;
  evidenceB?: string;
  required: number | null;
  available: number | null;
  delta: number | null;
  conclusion: string;
  createdAt: number;
}

export interface PlayStats {
  firstActionAt: number | null;
  askCount: number;
  hypothesisCreated: number;
  verdictAttempts: number;
}

export interface InvestigationState {
  caseId: string;
  phase: GamePhase;
  discovered: string[];
  doubt: Record<string, boolean>;
  notes: Record<string, string>;
  hypothesis: HypothesisFragment[];
  placements: Placement[];
  selection: string[];
  cursorT: number;
  filter: { person: PersonId | null; kind: EvidenceKind | null };
  mapMode: MapMode;
  hintLevel: number;
  tutorialStep: number;
  prefs: { sound: boolean; motion: boolean };
  startedAt: number;
  solvedAt: number | null;
  lastVerdict: VerdictResult | null;
  hotspotOpen: string | null;
  askOpen: PersonId | null;
  placedOnce: boolean;
  stats: PlayStats;
  verdictDraft: VerdictDraft;
  reasoningNotes: ReasoningNote[];
  /** 前台有效会话时长（毫秒），离开页面不计 */
  foregroundMs: number;
}

export const createInitialState = (): InvestigationState => ({
  caseId: 'case-001',
  phase: 'menu',
  discovered: [],
  doubt: {},
  notes: {},
  hypothesis: [],
  placements: [],
  selection: [],
  cursorT: 0,
  filter: { person: null, kind: null },
  mapMode: 'investigate',
  hintLevel: 0,
  tutorialStep: 0,
  prefs: { sound: false, motion: true },
  startedAt: Date.now(),
  solvedAt: null,
  lastVerdict: null,
  hotspotOpen: null,
  askOpen: null,
  placedOnce: false,
  stats: { firstActionAt: null, askCount: 0, hypothesisCreated: 0, verdictAttempts: 0 },
  verdictDraft: { person: '', eventLocation: '', eventT: null, timeLabel: '', object: '', stash: '', selectedEvidence: [] },
  reasoningNotes: [],
  foregroundMs: 0,
});

export type Action =
  | { type: 'GOTO_MENU' }
  | { type: 'START_NEW' }
  | { type: 'CONTINUE' }
  | { type: 'DISMISS_BRIEFING' }
  | { type: 'DISCOVER'; evidenceId: string }
  | { type: 'TOGGLE_DOUBT'; evidenceId: string }
  | { type: 'SET_NOTE'; evidenceId: string; note: string }
  | { type: 'ADD_HYPOTHESIS'; fragment: HypothesisFragment }
  | { type: 'REMOVE_HYPOTHESIS'; id: string }
  | { type: 'PLACE_CARD'; placement: Placement }
  | { type: 'REMOVE_PLACEMENT'; id: string }
  | { type: 'TOGGLE_SELECTION'; id: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'ASK_PERSON'; personId: PersonId }
  | { type: 'SET_VERDICT_DRAFT'; draft: Partial<VerdictDraft> }
  | { type: 'CLEAR_VERDICT_DRAFT' }
  | { type: 'ADD_REASONING_NOTE'; note: ReasoningNote }
  | { type: 'REMOVE_REASONING_NOTE'; index: number }
  | { type: 'SET_SELECTION'; ids: string[] }
  | { type: 'TOGGLE_HYPOTHESIS_ACTIVE'; id: string }
  | { type: 'SET_CURSOR'; t: number }
  | { type: 'CURSOR_STEP'; delta: number }
  | { type: 'SET_FILTER'; filter: InvestigationState['filter'] }
  | { type: 'SET_MAP_MODE'; mode: MapMode }
  | { type: 'OPEN_HINT' }
  | { type: 'TUTORIAL_NEXT' }
  | { type: 'TUTORIAL_DONE' }
  | { type: 'TUTORIAL_RESTART' }
  | { type: 'ADD_FOREGROUND'; ms: number }
  | { type: 'SET_PREFS'; prefs: Partial<InvestigationState['prefs']> }
  | { type: 'SET_HOTSPOT'; hotspotId: string | null }
  | { type: 'SET_ASK'; personId: PersonId | null }
  | { type: 'SUBMIT_VERDICT'; result: VerdictResult }
  | { type: 'LOAD'; state: InvestigationState };

// 首次有效操作时刻与各类计数；只在产生进展的动作里更新。
const touchStats = (
  state: InvestigationState,
  mutate?: (stats: PlayStats) => void,
): PlayStats => {
  const stats: PlayStats = {
    firstActionAt: state.stats.firstActionAt ?? Date.now(),
    askCount: state.stats.askCount,
    hypothesisCreated: state.stats.hypothesisCreated,
    verdictAttempts: state.stats.verdictAttempts,
  };
  mutate?.(stats);
  return stats;
};

const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const reducer = (
  state: InvestigationState,
  action: Action,
): InvestigationState => {
  switch (action.type) {
    case 'GOTO_MENU':
      return { ...state, phase: 'menu', hotspotOpen: null, askOpen: null };
    case 'START_NEW':
      return { ...createInitialState(), prefs: state.prefs, phase: 'briefing' };
    case 'CONTINUE':
      return { ...state, phase: 'investigating' };
    case 'DISMISS_BRIEFING':
      return { ...state, phase: 'investigating' };
    case 'DISCOVER': {
      if (state.discovered.includes(action.evidenceId)) return state;
      return {
        ...state,
        discovered: [...state.discovered, action.evidenceId],
        stats: touchStats(state),
      };
    }
    case 'ASK_PERSON':
      return {
        ...state,
        askOpen: action.personId,
        stats: touchStats(state, (stats) => {
          stats.askCount += 1;
        }),
      };
    case 'TOGGLE_DOUBT':
      return {
        ...state,
        doubt: { ...state.doubt, [action.evidenceId]: !state.doubt[action.evidenceId] },
      };
    case 'SET_NOTE':
      return { ...state, notes: { ...state.notes, [action.evidenceId]: action.note } };
    case 'ADD_HYPOTHESIS':
      return {
        ...state,
        hypothesis: [...state.hypothesis, action.fragment],
        stats: touchStats(state, (stats) => {
          stats.hypothesisCreated += 1;
        }),
      };
    case 'REMOVE_HYPOTHESIS':
      return {
        ...state,
        hypothesis: state.hypothesis.filter((fragment) => fragment.id !== action.id),
        selection: state.selection.filter((id) => id !== action.id),
        placements: state.placements.filter((p) => !(p.cardKind === 'hypothesis' && p.refId === action.id)),
      };
    case 'PLACE_CARD': {
      const placement = { ...action.placement, id: action.placement.id || uid('p') };
      const without = state.placements.filter((p) => p.refId !== placement.refId);
      return {
        ...state,
        placements: [...without, placement],
        placedOnce: true,
        stats: touchStats(state),
      };
    }
    case 'REMOVE_PLACEMENT':
      return { ...state, placements: state.placements.filter((p) => p.id !== action.id) };
    case 'TOGGLE_SELECTION': {
      const exists = state.selection.includes(action.id);
      if (exists) {
        return { ...state, selection: state.selection.filter((id) => id !== action.id) };
      }
      if (state.selection.length >= 2) {
        return { ...state, selection: [state.selection[1], action.id] };
      }
      return { ...state, selection: [...state.selection, action.id] };
    }
    case 'CLEAR_SELECTION':
      return { ...state, selection: [] };
    case 'SET_CURSOR':
      return { ...state, cursorT: action.t };
    case 'CURSOR_STEP': {
      // 在 reducer 内计算，避免连续点击时闭包里的旧 cursorT 被批处理重复使用。
      const next = snapToStep(state.cursorT + action.delta);
      return { ...state, cursorT: next };
    }
    case 'SET_FILTER':
      return { ...state, filter: action.filter };
    case 'SET_MAP_MODE':
      return { ...state, mapMode: action.mode };
    case 'OPEN_HINT':
      return { ...state, hintLevel: Math.min(3, state.hintLevel + 1) };
    case 'TUTORIAL_NEXT':
      return { ...state, tutorialStep: state.tutorialStep + 1 };
    case 'TUTORIAL_DONE':
      return { ...state, tutorialStep: -1 };
    case 'TUTORIAL_RESTART':
      // 重新查看引导一律回到第 0 步，无论之前完成到哪一步，且不清空进度
      return { ...state, tutorialStep: 0 };
    case 'ADD_FOREGROUND':
      return { ...state, foregroundMs: (state.foregroundMs ?? 0) + action.ms };
    case 'SET_PREFS':
      return { ...state, prefs: { ...state.prefs, ...action.prefs } };
    case 'SET_HOTSPOT':
      return { ...state, hotspotOpen: action.hotspotId };
    case 'SET_ASK':
      return { ...state, askOpen: action.personId };
    case 'SUBMIT_VERDICT':
      return {
        ...state,
        lastVerdict: action.result,
        solvedAt: action.result.solved ? (state.solvedAt ?? Date.now()) : state.solvedAt,
        phase: action.result.solved ? 'solved' : state.phase,
        stats: touchStats(state, (stats) => {
          stats.verdictAttempts += 1;
        }),
      };
    case 'SET_VERDICT_DRAFT':
      return { ...state, verdictDraft: { ...state.verdictDraft, ...action.draft } };
    case 'CLEAR_VERDICT_DRAFT':
      return { ...state, verdictDraft: createInitialState().verdictDraft };
    case 'ADD_REASONING_NOTE':
      return { ...state, reasoningNotes: [...state.reasoningNotes, action.note] };
    case 'SET_SELECTION':
      // 恢复对照或直接指定对照对象时整体替换，最多保留两端
      return { ...state, selection: action.ids.slice(0, 2) };
    case 'REMOVE_REASONING_NOTE':
      return {
        ...state,
        reasoningNotes: state.reasoningNotes.filter((_, index) => index !== action.index),
      };
    case 'TOGGLE_HYPOTHESIS_ACTIVE':
      return {
        ...state,
        hypothesis: state.hypothesis.map((fragment) =>
          fragment.id === action.id ? { ...fragment, active: !fragment.active } : fragment,
        ),
      };
    case 'LOAD': {
      // 兼容缺少 stats / verdictDraft / reasoningNotes 的旧存档
      const incoming = action.state;
      return {
        ...incoming,
        stats: incoming.stats ?? { firstActionAt: null, askCount: 0, hypothesisCreated: 0, verdictAttempts: 0 },
        verdictDraft: incoming.verdictDraft ?? createInitialState().verdictDraft,
        reasoningNotes: incoming.reasoningNotes ?? [],
        foregroundMs: incoming.foregroundMs ?? 0,
      };
    }
    default:
      return state;
  }
};

export const isDiscovered = (state: InvestigationState, evidenceId: string): boolean =>
  state.discovered.includes(evidenceId);

const KIND_LABEL: Record<SpotClaim['kind'], string> = {
  record: '记录',
  testimony: '证词',
  hypothesis: '假设',
};

// 已发现证据与假设中可渲染的时空声称；未发现证据绝不出现。
export const knownClaims = (state: InvestigationState): KnownClaimView[] => {
  const claims: KnownClaimView[] = [];
  for (const item of EVIDENCE) {
    if (!state.discovered.includes(item.id)) continue;
    for (const claim of item.claims ?? []) {
      if (!item.claimPerson) continue;
      claims.push({
        person: item.claimPerson as PersonId,
        location: claim.location,
        t: claim.t,
        kind: item.kind === 'record' ? 'record' : 'testimony',
        evidence: item.id,
        label: `${KIND_LABEL[item.kind === 'record' ? 'record' : 'testimony']} · ${item.id}`,
      });
    }
  }
  for (const fragment of state.hypothesis) {
    claims.push({
      person: fragment.person,
      location: fragment.from.location,
      t: fragment.from.t,
      kind: 'hypothesis',
      label: '假设',
    });
    if (fragment.to) {
      claims.push({
        person: fragment.person,
        location: fragment.to.location,
        t: fragment.to.t,
        kind: 'hypothesis',
        label: '假设',
      });
    }
  }
  return claims;
};

// 历史对照图在游标时刻的人物位置：已知则落点，中间一律未知，假设路径才模拟移动。
export const personPositionsAt = (
  state: InvestigationState,
  t: number,
): PersonPositionView[] => {
  const claims = knownClaims(state);
  return PEOPLE.map((person) => {
    const own = claims
      .filter((claim) => claim.person === person.id)
      .sort((a, b) => a.t - b.t);
    const exact = own.find((claim) => claim.t === t);
    if (exact) {
      return {
        person: person.id,
        status: 'known',
        location: exact.location,
        fromClaim: exact,
      };
    }
    const prev = [...own].reverse().find((claim) => claim.t < t);
    const next = own.find((claim) => claim.t > t);
    const simRoute = state.hypothesis.find((fragment) => {
      if (fragment.person !== person.id || !fragment.to || !fragment.active) return false;
      return fragment.from.t <= t && t <= fragment.to.t;
    });
    if (simRoute && simRoute.to) {
      const fromEdge = simRoute.from;
      const toEdge = simRoute.to;
      const span = toEdge.t - fromEdge.t || 1;
      const progress = (t - fromEdge.t) / span;
      return {
        person: person.id,
        status: 'simulated',
        location: progress < 0.5 ? fromEdge.location : toEdge.location,
        fromClaim: { ...fromEdge, person: person.id, kind: 'hypothesis', label: '假设' },
        toClaim: { ...toEdge, person: person.id, kind: 'hypothesis', label: '假设' },
      };
    }
    return {
      person: person.id,
      status: 'unknown',
      location: prev?.location,
      fromClaim: prev,
      toClaim: next,
    };
  });
};

export const claimsForPerson = (
  state: InvestigationState,
  personId: PersonId,
): KnownClaimView[] => knownClaims(state).filter((claim) => claim.person === personId);

export const objectiveAnchorsDiscovered = (state: InvestigationState): SpotClaim[] => {
  const all = objectiveAnchorsFromCase();
  return all.filter((anchor) => state.discovered.includes(anchor.evidence as string));
};

export const testimonyClaimsDiscovered = (state: InvestigationState): SpotClaim[] => {
  const all = testimonyClaimsFromCase();
  return all.filter((claim) => state.discovered.includes(claim.evidence as string));
};

export const cardKindOf = (kind: EvidenceKind): CardKind =>
  kind === 'record' ? 'record' : kind === 'testimony' ? 'testimony' : 'physical';
