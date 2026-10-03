import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportSave,
  importSave,
  loadState,
  saveState,
  SAVE_KEY,
  SCHEMA_VERSION,
} from '../../src/storage/save';
import { createInitialState } from '../../src/state/investigation';
import type { SavePayload } from '../../src/storage/save';

const stateWith = (overrides: Partial<ReturnType<typeof createInitialState>>) => ({
  ...createInitialState(),
  ...overrides,
});

const writeRaw = (payload: unknown): void => {
  window.localStorage.setItem(SAVE_KEY, typeof payload === 'string' ? payload : JSON.stringify(payload));
};

describe('存档写入与读取', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('正常保存后逐字段读取一致', () => {
    const state = stateWith({
      phase: 'investigating',
      discovered: ['E01', 'E04', 'E09'],
      notes: { E09: '需要核对' },
      doubt: { E05: true },
      cursorT: 150,
      tutorialStep: -1,
      prefs: { sound: false, motion: false },
    });
    const outcome = saveState(state);
    expect(outcome.ok).toBe(true);
    const loaded = loadState();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.payload.schemaVersion).toBe(SCHEMA_VERSION);
      expect(loaded.payload.state.discovered).toEqual(['E01', 'E04', 'E09']);
      expect(loaded.payload.state.notes).toEqual({ E09: '需要核对' });
      expect(loaded.payload.state.doubt).toEqual({ E05: true });
      expect(loaded.payload.state.cursorT).toBe(150);
      expect(loaded.payload.state.prefs).toEqual({ sound: false, motion: false });
    }
  });

  it('写入失败给出可读反馈，不静默丢档', () => {
    // jsdom 的 localStorage 是代理对象，实例属性不生效，需在原型上拦截。
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      });
    const outcome = saveState(stateWith({ phase: 'investigating' }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain('写入存档失败');
      expect(outcome.message).toContain('调查进度仍在当前页面中');
    }
    setItemSpy.mockRestore();
  });

  it('损坏 JSON 明确报错且保留原始记录', () => {
    writeRaw('{not json');
    const outcome = loadState();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('corrupt');
    expect(window.localStorage.getItem(SAVE_KEY)).toBe('{not json');
  });

  it('未知 schemaVersion 不恢复', () => {
    const payload: SavePayload = {
      schemaVersion: 999,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: stateWith({ phase: 'investigating' }),
    };
    writeRaw(payload);
    const outcome = loadState();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('schema');
  });

  it('其他案件版本不恢复', () => {
    const payload: SavePayload = {
      schemaVersion: 1,
      caseVersion: '9.9.9-other',
      caseId: 'case-002',
      savedAt: 0,
      state: stateWith({ phase: 'investigating' }),
    };
    writeRaw(payload);
    const outcome = loadState();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('case');
  });

  it('状态缺少必要字段不恢复', () => {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: { phase: 'investigating' },
    };
    writeRaw(payload);
    const outcome = loadState();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('state');
  });
});

describe('导出与导入', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('导出再导入能还原', () => {
    const state = stateWith({ phase: 'investigating', discovered: ['E01', 'E12'], cursorT: 150 });
    const raw = exportSave(state);
    const outcome = importSave(raw);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state.discovered).toEqual(['E01', 'E12']);
      expect(outcome.state.cursorT).toBe(150);
    }
  });

  it('非法 JSON 导入失败且不覆盖', () => {
    const current = stateWith({ phase: 'investigating', discovered: ['E03'] });
    const outcome = importSave('不是存档');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('不是有效的存档');
    expect(current.discovered).toEqual(['E03']);
  });

  it('导入包含未知证据 ID 时整单拒绝', () => {
    const payload: SavePayload = {
      schemaVersion: SCHEMA_VERSION,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: stateWith({ discovered: ['E01', 'E99'] }),
    };
    const outcome = importSave(JSON.stringify(payload));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('evidence');
  });

  it('导入时间越界的假设片段被拒绝', () => {
    const payload: SavePayload = {
      schemaVersion: SCHEMA_VERSION,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: stateWith({
        hypothesis: [
          {
            id: 'h1',
            person: 'su',
            from: { location: 'L', t: 999 },
          },
        ],
      }),
    };
    const outcome = importSave(JSON.stringify(payload));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('evidence');
  });

  it('导入引用未发现证据的布置被拒绝（读取与导入同口径）', () => {
    const payload: SavePayload = {
      schemaVersion: SCHEMA_VERSION,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: stateWith({ discovered: ['E01'], placements: [
        { id: 'p1', cardKind: 'evidence', refId: 'E07', lane: 'he', t: 150 },
      ] }),
    };
    const outcome = importSave(JSON.stringify(payload));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('evidence');
      expect(outcome.message).toContain('尚未发现');
    }
    // 读取路径同样拒绝
    writeRaw(payload);
    const loaded = loadState();
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.reason).toBe('state');
  });

  it('导入引用不存在假设片段的布置被拒绝', () => {
    const payload: SavePayload = {
      schemaVersion: SCHEMA_VERSION,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: stateWith({
        placements: [{ id: 'p1', cardKind: 'hypothesis', refId: 'h-ghost', lane: 'su', t: 60 }],
      }),
    };
    const outcome = importSave(JSON.stringify(payload));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('evidence');
  });

  it('假设缺少起点时给出字段级错误而非抛错白屏', () => {
    const broken = stateWith({ hypothesis: [{ id: 'h1', person: 'su' } as never] });
    const payload: SavePayload = {
      schemaVersion: SCHEMA_VERSION,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: broken,
    };
    expect(() => importSave(JSON.stringify(payload))).not.toThrow();
    const outcome = importSave(JSON.stringify(payload));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('起点');
  });

  it('负游标或缺 prefs 的存档被拒绝', () => {
    const negative = stateWith({ cursorT: -30 });
    writeRaw({ schemaVersion: SCHEMA_VERSION, caseVersion: '1.0.0', caseId: 'case-001', savedAt: 0, state: negative });
    expect(loadState().ok).toBe(false);
    const noPrefs = { ...createInitialState(), prefs: undefined as never };
    writeRaw({ schemaVersion: SCHEMA_VERSION, caseVersion: '1.0.0', caseId: 'case-001', savedAt: 0, state: noPrefs });
    const loaded = loadState();
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.reason).toBe('state');
  });

  it('畸形 UI 状态被安全迁移而非原样流入（TR2-004）', () => {
    const malformed = {
      ...createInitialState(),
      filter: null as never,
      reasoningNotes: 'broken notes' as never,
      verdictDraft: { ...createInitialState().verdictDraft, selectedEvidence: {} as never },
      prefs: { sound: 'yes' as never, motion: null as never },
      stats: { ...createInitialState().stats, askCount: 'many' as never },
    };
    const payload: SavePayload = {
      schemaVersion: SCHEMA_VERSION,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: malformed,
    };
    const outcome = importSave(JSON.stringify(payload));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state.filter).toEqual({ person: null, kind: null });
      expect(outcome.state.reasoningNotes).toEqual([]);
      expect(outcome.state.verdictDraft.selectedEvidence).toEqual([]);
      expect(outcome.state.prefs).toEqual({ sound: false, motion: true });
      expect(outcome.state.stats.askCount).toBe(0);
    }
    // 严重引用错误仍然整单拒绝
    const shifting = { ...malformed, filter: { person: null, kind: null }, reasoningNotes: [], placements: [
      { id: 'p1', cardKind: 'evidence', refId: 'E07', lane: 'su', t: 150 },
    ], discovered: [] };
    const bad = importSave(JSON.stringify({ ...payload, state: shifting }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toContain('尚未发现');
  });

  it('导入引用不存在人物的布置被拒绝', () => {
    const payload: SavePayload = {
      schemaVersion: SCHEMA_VERSION,
      caseVersion: '1.0.0',
      caseId: 'case-001',
      savedAt: 0,
      state: stateWith({
        placements: [
          { id: 'p1', cardKind: 'evidence', refId: 'E07', lane: ('ghost' as string) as never, t: 150 },
        ],
      }),
    };
    const outcome = importSave(JSON.stringify(payload));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('evidence');
  });
});
