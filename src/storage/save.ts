// 本地存档：带 schemaVersion 与 caseVersion 的 JSON，保存玩家状态，不保存 React/DOM。
// 版本不兼容或数据损坏时保留原始记录并支持导出，绝不静默清档。

import { CASE_ID, CASE_VERSION, DURATION_SECONDS, EVIDENCE } from '../content/case-001';
import type { InvestigationState } from '../state/investigation';
import { createInitialState } from '../state/investigation';

export const SAVE_KEY = 'midnight-train.save.v1';
export const SCHEMA_VERSION = 1;

export interface SavePayload {
  schemaVersion: number;
  caseVersion: string;
  caseId: string;
  savedAt: number;
  state: InvestigationState;
}

export type LoadFailReason = 'missing' | 'corrupt' | 'schema' | 'case' | 'state';

export type LoadOutcome =
  | { ok: true; payload: SavePayload }
  | { ok: false; reason: LoadFailReason; raw?: string };

export type WriteOutcome = { ok: true } | { ok: false; reason: 'unavailable' | 'failed'; message: string };

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const saveState = (state: InvestigationState): WriteOutcome => {
  const store = storage();
  if (!store) {
    return { ok: false, reason: 'unavailable', message: '浏览器不支持本地存储，请使用导出随身保存。' };
  }
  const payload: SavePayload = {
    schemaVersion: SCHEMA_VERSION,
    caseVersion: CASE_VERSION,
    caseId: CASE_ID,
    savedAt: Date.now(),
    state,
  };
  try {
    store.setItem(SAVE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'failed',
      message: `写入存档失败：${error instanceof Error ? error.message : '存储不可用'}。你的调查进度仍在当前页面中，可先导出。`,
    };
  }
};

const parsePayload = (raw: string): SavePayload | null => {
  try {
    const parsed = JSON.parse(raw) as SavePayload;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.schemaVersion !== 'number' ||
      typeof parsed.state !== 'object'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const loadState = (): LoadOutcome => {
  const store = storage();
  if (!store) return { ok: false, reason: 'missing' };
  let raw: string | null = null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return { ok: false, reason: 'corrupt', raw: undefined };
  }
  if (raw === null) return { ok: false, reason: 'missing' };
  const payload = parsePayload(raw);
  if (!payload) return { ok: false, reason: 'corrupt', raw };
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: 'schema', raw };
  }
  if (payload.caseId !== CASE_ID || payload.caseVersion !== CASE_VERSION) {
    return { ok: false, reason: 'case', raw };
  }
  if (!isStateShape(payload.state)) {
    return { ok: false, reason: 'state', raw };
  }
  // 读取与导入共用同一套完整校验，失败时保留原数据
  try {
    const sanitized = sanitizeState(payload.state);
    if (!sanitized.ok) {
      return { ok: false, reason: 'state', raw };
    }
    return { ok: true, payload: { ...payload, state: sanitized.state } };
  } catch (error) {
    void error;
    return { ok: false, reason: 'corrupt', raw };
  }
};

const REQUIRED_ARRAY_FIELDS = ['discovered', 'hypothesis', 'placements', 'selection'] as const;

const KNOWN_LOCATIONS = new Set(['S', 'D', 'L']);
const KNOWN_PEOPLE = new Set(['lin', 'su', 'zhou', 'he']);

const isWindowT = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= DURATION_SECONDS;

const isLocation = (value: unknown): value is string =>
  typeof value === 'string' && KNOWN_LOCATIONS.has(value);

const isPersonId = (value: unknown): value is string =>
  typeof value === 'string' && KNOWN_PEOPLE.has(value);

export const isStateShape = (state: unknown): state is InvestigationState => {
  if (typeof state !== 'object' || state === null) return false;
  const candidate = state as Record<string, unknown>;
  if (candidate.caseId !== CASE_ID) return false;
  if (!Array.isArray(candidate.discovered)) return false;
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(candidate[field])) return false;
  }
  if (!isWindowT(candidate.cursorT)) return false;
  if (typeof candidate.notes !== 'object' || candidate.notes === null) return false;
  if (typeof candidate.prefs !== 'object' || candidate.prefs === null) return false;
  const discovered = candidate.discovered as unknown[];
  if (!discovered.every((id) => typeof id === 'string')) return false;
  return true;
};

export const exportSave = (state: InvestigationState): string => {
  const payload: SavePayload = {
    schemaVersion: SCHEMA_VERSION,
    caseVersion: CASE_VERSION,
    caseId: CASE_ID,
    savedAt: Date.now(),
    state,
  };
  return JSON.stringify(payload, null, 2);
};

export type ImportOutcome =
  | { ok: true; state: InvestigationState }
  | { ok: false; reason: 'corrupt' | 'schema' | 'case' | 'evidence' | 'time' | 'state'; message: string };

const EVIDENCE_IDS = new Set(EVIDENCE.map((item) => item.id));

export const importSave = (raw: string): ImportOutcome => {
  const payload = parsePayload(raw);
  if (!payload) {
    return { ok: false, reason: 'corrupt', message: '文件不是有效的存档 JSON。' };
  }
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'schema',
      message: `存档 schema 版本为 ${payload.schemaVersion}，当前版本为 ${SCHEMA_VERSION}，不能覆盖当前进度。`,
    };
  }
  if (payload.caseId !== CASE_ID || payload.caseVersion !== CASE_VERSION) {
    return {
      ok: false,
      reason: 'case',
      message: `存档属于 ${payload.caseId} ${payload.caseVersion}，与当前案件不一致。`,
    };
  }
  if (!isStateShape(payload.state)) {
    return { ok: false, reason: 'state', message: '存档内的调查状态缺少必要字段或超出边界。' };
  }
  try {
    const sanitized = sanitizeState(payload.state);
    if (!sanitized.ok) {
      return { ok: false, reason: 'evidence', message: sanitized.message };
    }
    return { ok: true, state: sanitized.state };
  } catch (error) {
    return {
      ok: false,
      reason: 'corrupt',
      message: `解析存档状态时出错：${error instanceof Error ? error.message : '未知字段'}。`,
    };
  }
};


const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const asBoolRecord = (value: unknown): Record<string, boolean> => {
  if (typeof value !== 'object' || value === null) return {};
  const result: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'boolean') result[key] = item;
  }
  return result;
};

const asStringRecord = (value: unknown): Record<string, string> => {
  if (typeof value !== 'object' || value === null) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') result[key] = item;
  }
  return result;
};

const asEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;

const asNonNegativeInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

const PHASES = ['menu', 'briefing', 'investigating', 'solved'] as const;
const MAP_MODES = ['investigate', 'history'] as const;
const KINDS = ['record', 'testimony', 'physical'] as const;

const migrateFilter = (value: unknown): InvestigationState['filter'] => {
  if (typeof value !== 'object' || value === null) return { person: null, kind: null };
  const candidate = value as Record<string, unknown>;
  return {
    person: asEnum(candidate.person, ['lin', 'su', 'zhou', 'he']),
    kind: asEnum(candidate.kind, KINDS),
  };
};

const migrateStats = (value: unknown): InvestigationState['stats'] => {
  const base = createInitialState().stats;
  if (typeof value !== 'object' || value === null) return base;
  const candidate = value as Record<string, unknown>;
  return {
    firstActionAt: typeof candidate.firstActionAt === 'number' ? candidate.firstActionAt : null,
    askCount: asNonNegativeInt(candidate.askCount) ?? 0,
    hypothesisCreated: asNonNegativeInt(candidate.hypothesisCreated) ?? 0,
    verdictAttempts: asNonNegativeInt(candidate.verdictAttempts) ?? 0,
  };
};

const migrateVerdictDraft = (value: unknown): InvestigationState['verdictDraft'] => {
  const base = createInitialState().verdictDraft;
  if (typeof value !== 'object' || value === null) return base;
  const candidate = value as Record<string, unknown>;
  return {
    person: typeof candidate.person === 'string' ? candidate.person : '',
    eventLocation: typeof candidate.eventLocation === 'string' ? candidate.eventLocation : '',
    eventT: typeof candidate.eventT === 'number' ? candidate.eventT : null,
    timeLabel: typeof candidate.timeLabel === 'string' ? candidate.timeLabel : '',
    object: typeof candidate.object === 'string' ? candidate.object : '',
    stash: typeof candidate.stash === 'string' ? candidate.stash : '',
    selectedEvidence: asStringArray(candidate.selectedEvidence),
  };
};

const migrateReasoningNotes = (value: unknown): InvestigationState['reasoningNotes'] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .filter((item) => typeof item.conclusion === 'string' && typeof item.id === 'string')
    .map((item) => ({
      id: item.id as string,
      mode: asEnum(item.mode, ['trip', 'event', 'cross']) ?? 'trip',
      labelA: typeof item.labelA === 'string' ? item.labelA : '',
      labelB: typeof item.labelB === 'string' ? item.labelB : '',
      evidenceA: typeof item.evidenceA === 'string' ? item.evidenceA : undefined,
      evidenceB: typeof item.evidenceB === 'string' ? item.evidenceB : undefined,
      required: typeof item.required === 'number' ? item.required : null,
      available: typeof item.available === 'number' ? item.available : null,
      delta: typeof item.delta === 'number' ? item.delta : null,
      conclusion: item.conclusion as string,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : 0,
    }));
};

const migrateLastVerdict = (value: unknown): InvestigationState['lastVerdict'] => {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.solved !== 'boolean' || !Array.isArray(candidate.slots)) return null;
  return candidate as unknown as InvestigationState['lastVerdict'];
};

// 统一校验：字段类型、枚举、有限整数秒、引用存在且已发现、假设 from/to 完整与先后。
// 出错时携带字段路径，整单拒绝，不覆盖当前进度。
export type SanitizeResult =
  | { ok: true; state: InvestigationState }
  | { ok: false; field: string; message: string };

const isPoint = (value: unknown): value is { location: string; t: number } =>
  typeof value === 'object' &&
  value !== null &&
  isLocation((value as { location: unknown }).location) &&
  isWindowT((value as { t: unknown }).t);

export const sanitizeState = (state: InvestigationState): SanitizeResult => {
  for (const id of state.discovered) {
    if (!EVIDENCE_IDS.has(id)) {
      return { ok: false, field: 'discovered', message: `存档包含未知证据标识 ${id}。` };
    }
  }
  const discoveredSet = new Set(state.discovered);
  for (const [index, fragment] of state.hypothesis.entries()) {
    const path = `hypothesis[${index}]`;
    if (!isPersonId(fragment.person)) {
      return { ok: false, field: path, message: `${path} 引用了未知人物。` };
    }
    if (!isPoint(fragment.from)) {
      return { ok: false, field: `${path}.from`, message: `${path} 的起点缺少地点或合法时刻。` };
    }
    if (fragment.to !== undefined) {
      if (!isPoint(fragment.to)) {
        return { ok: false, field: `${path}.to`, message: `${path} 的终点缺少地点或合法时刻。` };
      }
      if (fragment.to.t < fragment.from.t) {
        return { ok: false, field: `${path}.to`, message: `${path} 的终点早于起点。` };
      }
    }
  }
  const hypothesisIds = new Set(state.hypothesis.map((fragment) => fragment.id));
  for (const [index, placement] of state.placements.entries()) {
    const path = `placements[${index}]`;
    if (!isPersonId(placement.lane)) {
      return { ok: false, field: path, message: `${path} 引用了未知人物轨道。` };
    }
    if (!isWindowT(placement.t)) {
      return { ok: false, field: path, message: `${path} 的时刻超出事件窗口。` };
    }
    if (placement.cardKind === 'evidence') {
      if (!EVIDENCE_IDS.has(placement.refId)) {
        return { ok: false, field: path, message: `${path} 引用了未知证据。` };
      }
      if (!discoveredSet.has(placement.refId)) {
        return { ok: false, field: path, message: `${path} 引用了尚未发现的证据。` };
      }
    } else if (!hypothesisIds.has(placement.refId)) {
      return { ok: false, field: path, message: `${path} 引用了不存在的假设片段。` };
    }
  }
  // 白名单重建：未逐字段约束的 UI 状态不原样流入应用，畸形值迁移为默认而非整体放行
  const base = createInitialState();
  const built: InvestigationState = {
    ...base,
    caseId: CASE_ID,
    phase: asEnum(state.phase, PHASES) ?? 'menu',
    discovered: state.discovered.filter((id) => EVIDENCE_IDS.has(id)),
    doubt: asBoolRecord(state.doubt),
    notes: asStringRecord(state.notes),
    hypothesis: state.hypothesis,
    placements: state.placements,
    selection: asStringArray(state.selection),
    cursorT: isWindowT(state.cursorT) ? state.cursorT : 0,
    filter: migrateFilter(state.filter),
    mapMode: asEnum(state.mapMode, MAP_MODES) ?? 'investigate',
    hintLevel: Math.min(3, asNonNegativeInt(state.hintLevel) ?? 0),
    tutorialStep: asNonNegativeInt(state.tutorialStep) ?? (typeof state.tutorialStep === 'number' ? -1 : 0),
    prefs: {
      sound: typeof state.prefs?.sound === 'boolean' ? state.prefs.sound : false,
      motion: typeof state.prefs?.motion === 'boolean' ? state.prefs.motion : true,
    },
    startedAt: typeof state.startedAt === 'number' ? state.startedAt : Date.now(),
    solvedAt: typeof state.solvedAt === 'number' ? state.solvedAt : null,
    lastVerdict: migrateLastVerdict(state.lastVerdict),
    hotspotOpen: typeof state.hotspotOpen === 'string' ? state.hotspotOpen : null,
    askOpen: asEnum(state.askOpen, ['lin', 'su', 'zhou', 'he']),
    placedOnce: typeof state.placedOnce === 'boolean' ? state.placedOnce : false,
    stats: migrateStats(state.stats),
    verdictDraft: migrateVerdictDraft(state.verdictDraft),
    reasoningNotes: migrateReasoningNotes(state.reasoningNotes),
    foregroundMs: asNonNegativeInt(state.foregroundMs) ?? 0,
  };
  return { ok: true, state: built };
};
