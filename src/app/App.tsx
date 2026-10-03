import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AUTHOR_TIMELINE,
  BRIEFING,
  CARROAGES,
  CASE_TITLE,
  ENDING_DIALOGUE,
  EVIDENCE,
  EXCLUSION_TABLE,
  HINT_LAYERS,
  HOTSPOTS,
  PEOPLE,
  TUTORIAL_STEPS,
  VERDICT_SPEC,
} from '../content/case-001';
import type { EvidenceItem, Hotspot, PersonId } from '../content/case-001';
import { EDGES } from '../content/case-001';
import { formatT } from '../content/time-origin';
import { TrainMap } from '../components/TrainMap';
import { Timeline } from '../components/Timeline';
import type { PlaceIntent, TimelineCard } from '../components/Timeline';
import { CluePanel } from '../components/CluePanel';
import { DetailPanel } from '../components/DetailPanel';
import type { DetailTab } from '../components/DetailPanel';
import {
  HelpModal,
  HypothesisModal,
  SettingsModal,
  UninvestigatedModal,
} from '../components/Modals';
import type { CompareClaim } from '../components/ComparePanel';
import type { VerdictSubmission } from '../components/VerdictPanel';
import {
  createInitialState,
  isDiscovered,
  objectiveAnchorsDiscovered,
  personPositionsAt,
  reducer,
} from '../state/investigation';
import type { InvestigationState } from '../state/investigation';
import {
  exportSave,
  importSave,
  loadState,
  saveState,
  SAVE_KEY,
  type ImportOutcome,
  type LoadFailReason,
  type LoadOutcome,
} from '../storage/save';
import { evaluateVerdict } from '../domain/verdict';
import { sfxCardPlaced, sfxCardReceived, sfxContradiction, sfxSolved } from '../sound/sfx';

type ModalKind = 'help' | 'settings' | 'hints' | 'uninvestigated' | 'hypothesis' | null;
type MobilePane = 'map' | 'clues' | 'timeline';
type AskAnswer = { person: PersonId; answer: string; evidence?: string; tone: string };

const evidenceOf = (id: string): EvidenceItem | undefined =>
  EVIDENCE.find((item) => item.id === id);

const buildTimelineCards = (state: InvestigationState): TimelineCard[] =>
  state.placements.map((placement) => {
    if (placement.cardKind === 'evidence') {
      const item = evidenceOf(placement.refId) as EvidenceItem;
      return {
        key: placement.id,
        refId: item.id,
        cardKind: 'evidence',
        lane: placement.lane,
        t: item.recordedAt ?? 0,
        title: `${item.id} ${item.title}`,
        ticks: (item.claims ?? []).map((claim) => ({
          location: claim.location,
          t: claim.t,
          kind: item.kind === 'record' ? ('record' as const) : ('testimony' as const),
        })),
      };
    }
    const fragment = state.hypothesis.find((item) => item.id === placement.refId)!;
    return {
      key: placement.id,
      refId: fragment.id,
      cardKind: 'hypothesis',
      lane: placement.lane,
      t: fragment.from.t,
      title: fragment.note ? `假设 · ${fragment.note}` : '假设片段',
      ticks: [fragment.from, fragment.to]
        .filter((point): point is NonNullable<typeof point> => point !== undefined)
        .map((point) => ({ ...point, kind: 'hypothesis' as const })),
    };
  });

const selectionClaims = (state: InvestigationState): CompareClaim[] => {
  const claims: CompareClaim[] = [];
  for (const id of state.selection) {
    const item = evidenceOf(id);
    if (item && isDiscovered(state, id)) {
      // E07/E11 是无主体的事件锚点（claimPerson 为空），对照器按“事件模式”处理
      const person = item.claimPerson as PersonId | null;
      for (const claim of item.claims ?? []) {
        claims.push({
          person,
          location: claim.location,
          t: claim.t,
          kind: item.kind === 'record' ? 'record' : 'testimony',
          evidenceId: item.id,
          origin: `${item.id} ${item.title}`,
        });
      }
      continue;
    }
    const fragment = state.hypothesis.find((candidate) => candidate.id === id);
    if (fragment) {
      const origin = fragment.note ? `假设 · ${fragment.note}` : '假设片段';
      claims.push({
        person: fragment.person,
        location: fragment.from.location,
        t: fragment.from.t,
        kind: 'hypothesis',
        origin,
      });
      if (fragment.to) {
        claims.push({
          person: fragment.person,
          location: fragment.to.location,
          t: fragment.to.t,
          kind: 'hypothesis',
          origin,
        });
      }
    }
  }
  return claims;
};

const selectionTitles = (state: InvestigationState): string[] => {
  const titles: string[] = [];
  for (const id of state.selection) {
    const item = evidenceOf(id);
    const fragment = state.hypothesis.find((candidate) => candidate.id === id);
    if (item && isDiscovered(state, id)) titles.push(`${item.id} ${item.title}`);
    else if (fragment) titles.push(fragment.note ? `假设 · ${fragment.note}` : '假设片段');
  }
  return titles;
};

const failReasonText = (reason: LoadFailReason): string =>
  reason === 'corrupt'
    ? '存档数据损坏'
    : reason === 'schema'
      ? '存档版本与当前程序不兼容'
      : reason === 'case'
        ? '存档属于其他案件或版本'
        : reason === 'state'
          ? '存档内的调查状态不完整'
          : '';

const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
};

// 试玩指标：首次有效操作、总时长、询问/假设/提示/结案尝试，供人工试玩直接读数。
const PlayStatsView = ({ state }: { state: InvestigationState }) => {
  const firstActionMs = state.stats.firstActionAt
    ? state.stats.firstActionAt - state.startedAt
    : null;
  const totalMs = state.solvedAt ? state.solvedAt - state.startedAt : null;
  const foregroundMs = state.foregroundMs ?? 0;
  return (
    <ul className="uninvestigated" style={{ padding: 0 }}>
      <li>
        <strong>首次有效操作</strong>：{firstActionMs === null ? '未记录' : formatDuration(firstActionMs)}（自进入简报起）
      </li>
      <li>
        <strong>调查总时长</strong>：{totalMs === null ? '未记录' : formatDuration(totalMs)}
        （其中前台有效 <span className="mono">{formatDuration(foregroundMs)}</span>，页面挂起不计）
      </li>
      <li>
        <strong>询问次数</strong>：{state.stats.askCount} · <strong>新建假设</strong>：{state.stats.hypothesisCreated} ·{' '}
        <strong>提示展开</strong>：{state.hintLevel} / {HINT_LAYERS.length} · <strong>结案尝试</strong>：{state.stats.verdictAttempts}
      </li>
    </ul>
  );
};

export const App = () => {
  const [bootLoad] = useState<LoadOutcome>(() => loadState());
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    if (!bootLoad.ok) return createInitialState();
    // 恢复数据但回到主菜单：首屏默认突出“继续调查”；已结案的回顾除外。
    const restored = bootLoad.payload.state;
    return restored.phase === 'solved' ? restored : { ...restored, phase: 'menu' as const };
  });
  const [detailEvidenceId, setDetailEvidenceId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('evidence');
  const [placementPending, setPlacementPending] = useState<{
    cardKind: 'evidence' | 'hypothesis';
    refId: string;
    title: string;
  } | null>(null);
  const [hotspotOpenId, setHotspotOpenId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [askPerson, setAskPerson] = useState<PersonId | null>(null);
  const [askAnswer, setAskAnswer] = useState<AskAnswer | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>('clues');
  const [detailOpenMobile, setDetailOpenMobile] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const activeSinceRef = useRef<number | null>(null);
  useEffect(() => {
    activeSinceRef.current = Date.now();
    const settle = () => {
      if (activeSinceRef.current === null) return;
      const ms = Date.now() - activeSinceRef.current;
      if (ms > 0 && ms < 24 * 3600 * 1000) {
        dispatch({ type: 'ADD_FOREGROUND', ms });
      }
      activeSinceRef.current = null;
    };
    const resume = () => {
      activeSinceRef.current = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') settle();
      else resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', settle);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', settle);
      settle();
    };
  }, []);

  useEffect(() => {
    window.__train_debug__ = serializeState(state);
    return () => {
      window.__train_debug__ = undefined;
    };
  }, [state]);

  useEffect(() => {
    if (state.phase === 'menu') return;
    const outcome = saveState(state);
    setSaveError(outcome.ok ? null : outcome.message);
  }, [state]);

  const discoveredCount = useMemo(
    () => EVIDENCE.filter((item) => isDiscovered(state, item.id)).length,
    [state],
  );

  const investigatedHotspotIds = useMemo(() => {
    const done = new Set<string>();
    for (const hotspot of HOTSPOTS) {
      if (hotspot.evidence.every((id) => isDiscovered(state, id))) done.add(hotspot.id);
    }
    return done;
  }, [state]);

  const timelineCards = useMemo(
    () => buildTimelineCards(state),
    [state],
  );

  const compareClaims = useMemo(
    () => selectionClaims(state),
    [state],
  );
  const compareTitles = useMemo(() => selectionTitles(state), [state]);

  const historyPositions = useMemo(
    () => personPositionsAt(state, state.cursorT),
    [state],
  );

  const failedBoot = !bootLoad.ok && bootLoad.reason !== 'missing';
  // 本地存在存档键（可读取或已损坏）时，新调查都必须确认替换
  const hasSave = bootLoad.ok || failedBoot || hasProgress;

  // ---------- 交互 ----------

  const openHotspot = (hotspot: Hotspot) => {
    setHotspotOpenId(hotspot.id);
    if (state.mapMode !== 'investigate') dispatch({ type: 'SET_MAP_MODE', mode: 'investigate' });
  };

  const investigateEvidence = (item: EvidenceItem) => {
    dispatch({ type: 'DISCOVER', evidenceId: item.id });
    sfxCardReceived(state.prefs.sound);
    // 不关闭热点弹窗：同一热点的其余记录可直接继续阅读，重复调查显示“已取得”。
    setDetailEvidenceId(item.id);
    setDetailTab('evidence');
    if (item.id === 'E01' && state.tutorialStep === 0) {
      dispatch({ type: 'TUTORIAL_NEXT' });
    }
  };

  const openCardDetail = (refId: string) => {
    setDetailEvidenceId(refId);
    setDetailTab('evidence');
    setDetailOpenMobile(true);
  };

  const requestPlacement = (item: EvidenceItem) => {
    if (item.recordedAt === null) return;
    setPlacementPending({ cardKind: 'evidence', refId: item.id, title: `${item.id} ${item.title}` });
    setDetailOpenMobile(false);
  };

  const handlePlace = (intent: PlaceIntent) => {
    const t =
      intent.cardKind === 'evidence'
        ? (evidenceOf(intent.refId)?.recordedAt ?? 0)
        : (state.hypothesis.find((fragment) => fragment.id === intent.refId)?.from.t ?? 0);
    dispatch({
      type: 'PLACE_CARD',
      placement: { id: '', cardKind: intent.cardKind, refId: intent.refId, lane: intent.lane, t },
    });
    sfxCardPlaced(state.prefs.sound);
    setPlacementPending(null);
    if (state.tutorialStep === 1) dispatch({ type: 'TUTORIAL_NEXT' });
  };

  const toggleSelection = (id: string) => {
    dispatch({ type: 'TOGGLE_SELECTION', id });
    setDetailTab('compare');
  };

  const handleVerdict = (submission: VerdictSubmission) => {
    // 结案前把当前可见段的时长计入前台有效时长（单页直通没有可见性切换可触发结算）
    if (document.visibilityState === 'visible' && activeSinceRef.current !== null) {
      dispatch({ type: 'ADD_FOREGROUND', ms: Date.now() - activeSinceRef.current });
      activeSinceRef.current = Date.now();
    }
    const result = evaluateVerdict(VERDICT_SPEC, {
      ...submission,
      discoveredEvidence: state.discovered,
      objectiveAnchors: objectiveAnchorsDiscovered(state),
      edges: EDGES,
    });
    dispatch({ type: 'SUBMIT_VERDICT', result });
    if (result.solved) sfxSolved(state.prefs.sound);
    else if (result.slots.some((slot) => !slot.supported)) sfxContradiction(state.prefs.sound);
  };

  const handleExport = () => {
    // 失败启动时导出的是本地原始字节，不是新建默认状态；正常时导出当前进度
    const raw = failedBoot && bootLoad.raw ? bootLoad.raw : exportSave(stateRef.current);
    try {
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `midnight-train-save-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      const anchor = document.createElement('a');
      anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(raw)}`;
      anchor.download = `midnight-train-save-${Date.now()}.json`;
      anchor.click();
    }
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const outcome: ImportOutcome = importSave(String(reader.result));
      if (outcome.ok) {
        dispatch({ type: 'LOAD', state: outcome.state });
        setImportError(null);
        setModal(null);
        setConfirmNewGame(false);
      } else {
        setImportError(outcome.message);
      }
    };
    reader.onerror = () => setImportError('读取文件失败。');
    reader.readAsText(file);
  };

  const handleDeleteSave = () => {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // 存储不可用时删除同样无意义，不阻塞流程
    }
    dispatch({ type: 'START_NEW' });
    setModal(null);
    setConfirmNewGame(false);
  };

  const askTopic = (personId: PersonId, topicId: string) => {
    const person = PEOPLE.find((candidate) => candidate.id === personId)!;
    const topic = person.topics.find((candidate) => candidate.id === topicId)!;
    dispatch({ type: 'ASK_PERSON', personId });
    setAskAnswer({
      person: personId,
      answer: topic.answer,
      evidence: topic.evidence,
      tone: topic.evidence ? 'testimony' : 'record',
    });
    if (topic.evidence && !isDiscovered(state, topic.evidence)) {
      dispatch({ type: 'DISCOVER', evidenceId: topic.evidence });
      sfxCardReceived(state.prefs.sound);
    }
  };

  const restartTutorial = () => {
    dispatch({ type: 'TUTORIAL_RESTART' });
    setModal(null);
  };

  // Escape 统一关闭弹层；放置待定由 Timeline 自己监听 Esc 取消。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        (modal || hotspotOpenId || detailOpenMobile || confirmNewGame)
      ) {
        setModal(null);
        setHotspotOpenId(null);
        setDetailOpenMobile(false);
        setConfirmNewGame(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, hotspotOpenId, detailOpenMobile, confirmNewGame]);

  // 保存失败横幅
  const saveBanner = saveError ? (
    <p className="vd-warning" role="alert" style={{ margin: '8px 12px 0' }}>
      {saveError}进度仍在当前页面中，请尽早导出存档。
    </p>
  ) : null;

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/json"
      className="sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) handleImportFile(file);
        event.target.value = '';
      }}
    />
  );

  // ---------------- 主菜单 ----------------

  if (state.phase === 'menu') {
    return (
      <div className={`app ${state.prefs.motion ? '' : 'no-motion'}`}>
        <header className="topbar">
          <span className="topbar-title">{CASE_TITLE}</span>
          <span className="save-state">午夜列车 · 平面推理</span>
        </header>
        <main className="menu">
          <div className="menu-card">
            <h1>失踪的星图盘</h1>
            <p>
              一列午夜列车，一枚从展匣里消失的黄铜星图盘，四名当事人。调查物件与人物，把证词放上时间轴，
              用通行规则找出不能同时成立的说法，最后提交由证据支持的结论。
            </p>
            {failedBoot && (
              <p className="vd-warning">
                读取本地存档失败：{failReasonText(bootLoad.reason)}。原始记录仍保留在本地，可先导出再开始新调查。
              </p>
            )}
            <div className="menu-actions">
              {bootLoad.ok && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setHasProgress(true);
                    dispatch({ type: 'CONTINUE' });
                  }}
                >
                  继续调查
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (hasSave) {
                    setConfirmNewGame(true);
                  } else {
                    setHasProgress(true);
                    dispatch({ type: 'START_NEW' });
                  }
                }}
              >
                开始新调查
              </button>
              <button type="button" className="btn" onClick={() => setModal('help')}>
                操作帮助
              </button>
              <button type="button" className="btn" onClick={() => setModal('settings')}>
                设置 / 存档
              </button>
            </div>
            {failedBoot && (
              <div className="menu-actions">
                <button type="button" className="btn btn-small" onClick={handleExport}>
                  导出旧档记录
                </button>
              </div>
            )}
          </div>
        </main>
        {confirmNewGame && (
          <div className="overlay" role="dialog" aria-modal="true" aria-label="确认开始新调查">
            <div className="overlay-card">
              <h2>开始新调查？</h2>
              <p>
                当前进度仍在本地。先导出存档可以随时恢复；确认后，新调查的第一次保存会覆盖旧档。
              </p>
              <div className="menu-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setConfirmNewGame(false);
                    setHasProgress(true);
                    dispatch({ type: 'START_NEW' });
                  }}
                >
                  确认开始新调查
                </button>
                <button type="button" className="btn" onClick={() => setConfirmNewGame(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
        {modal === 'help' && <HelpModal onClose={() => setModal(null)} onRestartTutorial={restartTutorial} />}
        {modal === 'settings' && (
          <SettingsModal
            state={state}
            importError={importError}
            onToggleSound={(value) => dispatch({ type: 'SET_PREFS', prefs: { sound: value } })}
            onToggleMotion={(value) => dispatch({ type: 'SET_PREFS', prefs: { motion: value } })}
            onExport={handleExport}
            onImportClick={() => fileInputRef.current?.click()}
            onDelete={handleDeleteSave}
            onClose={() => setModal(null)}
          />
        )}
        {fileInput}
      </div>
    );
  }

  // ---------------- 简报 ----------------

  if (state.phase === 'briefing') {
    return (
      <div className={`app ${state.prefs.motion ? '' : 'no-motion'}`}>
        <div className="overlay" role="dialog" aria-modal="true" aria-label="委托简报">
          <div className="overlay-card">
            <h2>委托</h2>
            <p className="briefing-text">{BRIEFING}</p>
            <div className="menu-actions">
              <button type="button" className="btn btn-primary" onClick={() => { setHasProgress(true); dispatch({ type: 'DISMISS_BRIEFING' }); }}>
                进入列车
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- 结案后回顾 ----------------

  if (state.phase === 'solved') {
    return (
      <div className={`app ${state.prefs.motion ? '' : 'no-motion'}`}>
        <header className="topbar">
          <span className="topbar-title">{CASE_TITLE}</span>
          <span className="topbar-spacer" />
          <span className="save-state">已结案 · 自动保存</span>
          <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'GOTO_MENU' })}>
            回到主菜单
          </button>
        </header>
        <main className="ending">
          <div className="ending-card">
            <h2>结案回顾</h2>
            <p className="clue-empty">
              以下为已经证明的事件，仅在结案后展示。你找到 {discoveredCount} / {EVIDENCE.length} 条证据。
            </p>
            <PlayStatsView state={state} />
            <table className="timeline-table">
              <thead>
                <tr>
                  <th>时刻</th>
                  <th>相对秒</th>
                  <th>事件</th>
                  <th>依据</th>
                </tr>
              </thead>
              <tbody>
                {AUTHOR_TIMELINE.map((row, index) => {
                  const seen = (row.provenBy ?? []).filter((id) => isDiscovered(state, id));
                  return (
                    <tr key={`${row.clock}-${index}`}>
                      <td className="mono">{row.clock}</td>
                      <td className="mono">t={row.t}</td>
                      <td>{row.fact}</td>
                      <td>
                        {row.proven === 'record' && (
                          <span className="kind-tag record">证据支持 {seen.join(' ')}</span>
                        )}
                        {row.proven === 'inference' && (
                          <span className="kind-tag testimony">证据链推论（{seen.join(' ')}）</span>
                        )}
                        {row.proven === 'reconstruction' && (
                          <span className="kind-tag">作者重建</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h2>为何其他三人被排除</h2>
            <p className="ev-text" style={{ whiteSpace: 'pre-wrap' }}>
              {EXCLUSION_TABLE}
            </p>
            <h2>你的推理笔记</h2>
            {state.reasoningNotes.length === 0 ? (
              <p className="clue-empty">本次调查没有钉存的对照结论。</p>
            ) : (
              <ul className="uninvestigated">
                {state.reasoningNotes.map((note) => (
                  <li key={note.id}>
                    <strong>{note.labelA} ↔ {note.labelB}</strong>：{note.conclusion}
                  </li>
                ))}
              </ul>
            )}
            <h2>动机</h2>
            <p className="dialogue">{ENDING_DIALOGUE}</p>
            <div className="menu-actions">
              <button type="button" className="btn" onClick={() => dispatch({ type: 'GOTO_MENU' })}>
                回到主菜单
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------------- 调查主界面 ----------------

  const detailItem = detailEvidenceId ? evidenceOf(detailEvidenceId) ?? null : null;
  const hotspotOpen = hotspotOpenId ? HOTSPOTS.find((hotspot) => hotspot.id === hotspotOpenId) ?? null : null;

  const cluePanel = (
    <CluePanel
      state={state}
      onFilter={(filter) => dispatch({ type: 'SET_FILTER', filter })}
      onOpenDetail={openCardDetail}
      onToggleSelection={toggleSelection}
      onOpenHypothesis={() => setModal('hypothesis')}
      onRemoveHypothesis={(id) => dispatch({ type: 'REMOVE_HYPOTHESIS', id })}
      onRemoveNote={(index) => dispatch({ type: 'REMOVE_REASONING_NOTE', index })}
      onActivateHypothesis={(id) => dispatch({ type: 'TOGGLE_HYPOTHESIS_ACTIVE', id })}
      onRestoreNote={(note) => {
        const ids = [note.evidenceA, note.evidenceB].filter(
          (id): id is string => id !== undefined && isDiscovered(state, id),
        );
        if (ids.length > 0) {
          dispatch({ type: 'SET_SELECTION', ids });
          setDetailTab('compare');
          setDetailOpenMobile(true);
        }
      }}
    />
  );

  const trainMap = (key: string) => (
    <TrainMap
      key={key}
      mapMode={state.mapMode}
      cursorT={state.cursorT}
      investigatedHotspotIds={investigatedHotspotIds}
      pendingHotspotIds={new Set<string>()}
      hotspotOpen={hotspotOpenId}
      historyPositions={historyPositions}
      onHotspotClick={openHotspot}
      onSetMapMode={(mode) => dispatch({ type: 'SET_MAP_MODE', mode })}
      onOpenUninvestigated={() => setModal('uninvestigated')}
    />
  );

  const timeline = (key: string) => (
    <Timeline
      key={key}
      cards={timelineCards}
      cursorT={state.cursorT}
      selection={state.selection}
      placementPending={placementPending}
      onCursor={(t) => {
        dispatch({ type: 'SET_CURSOR', t });
        if (state.tutorialStep === 2) dispatch({ type: 'TUTORIAL_NEXT' });
      }}
      onCursorStep={(delta) => dispatch({ type: 'CURSOR_STEP', delta })}
      onPlace={handlePlace}
      onRemovePlacement={(id) => dispatch({ type: 'REMOVE_PLACEMENT', id })}
      onCancelPlacement={() => setPlacementPending(null)}
      onToggleCardSelection={toggleSelection}
      onOpenCardDetail={openCardDetail}
      onCreateHypothesis={() => setModal('hypothesis')}
    />
  );

  return (
    <div className={`app ${state.prefs.motion ? '' : 'no-motion'}`}>
      <header className="topbar">
        <span className="topbar-title">{CASE_TITLE}</span>
        <span className="save-state">
          <span className={`save-dot ${saveError ? 'warn' : 'idle'}`} aria-hidden="true" />
          {saveError ? '保存失败' : '已自动保存'} · 证据 {discoveredCount}/{EVIDENCE.length} · 游标 {formatT(state.cursorT)}
        </span>
        <span className="topbar-spacer" />
        <button type="button" className="btn btn-small" onClick={() => setModal('hints')}>
          提示 {state.hintLevel}/3
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setDetailTab('ask');
            setDetailOpenMobile(true);
          }}
        >
          询问
        </button>
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={() => {
            setDetailTab('verdict');
            setDetailOpenMobile(true);
          }}
        >
          结案
        </button>
        <button type="button" className="btn btn-small" onClick={() => setModal('settings')}>
          设置
        </button>
        <button type="button" className="btn btn-small" onClick={() => setModal('help')}>
          帮助
        </button>
      </header>

      {saveBanner}

      <div className="mobile-tabs" role="tablist" aria-label="移动端面板切换">
        {(['clues', 'map', 'timeline'] as MobilePane[]).map((pane) => (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={mobilePane === pane}
            className={`btn ${mobilePane === pane ? 'btn-primary' : ''}`}
            onClick={() => setMobilePane(pane)}
          >
            {pane === 'clues' ? '线索' : pane === 'map' ? '地图' : '时间轴'}
          </button>
        ))}
      </div>

      <main className="main-grid">
        {cluePanel}
        {trainMap('map-desktop')}
        {timeline('timeline-desktop')}
        <DetailPanel
          state={state}
          tab={detailTab}
          setTab={setDetailTab}
          detailItem={detailItem}
          detailItemMatched={detailItem ? isDiscovered(state, 'E01') : false}
          detailItemPending={placementPending?.refId === detailItem?.id}
          onToggleCompare={() => detailItem && toggleSelection(detailItem.id)}
          onRequestPlacement={() => detailItem && requestPlacement(detailItem)}
          onToggleDoubt={() => detailItem && dispatch({ type: 'TOGGLE_DOUBT', evidenceId: detailItem.id })}
          onSaveNote={(note) => detailItem && dispatch({ type: 'SET_NOTE', evidenceId: detailItem.id, note })}
          compareClaims={compareClaims}
          compareTitles={compareTitles}
          onClearCompare={() => dispatch({ type: 'CLEAR_SELECTION' })}
          onPinNote={(note) => dispatch({ type: 'ADD_REASONING_NOTE', note })}
          askPerson={askPerson}
          setAskPerson={setAskPerson}
          askAnswer={askAnswer}
          onAskTopic={askTopic}
          onVerdict={handleVerdict}
          verdictDraft={state.verdictDraft}
          onVerdictDraftChange={(draft) => dispatch({ type: 'SET_VERDICT_DRAFT', draft })}
          detailOpenMobile={detailOpenMobile}
          onCloseMobile={() => setDetailOpenMobile(false)}
        />
      </main>

      <div className="mobile-pane" data-pane={mobilePane}>
        {mobilePane === 'clues' && cluePanel}
        {mobilePane === 'map' && trainMap('map-mobile')}
        {mobilePane === 'timeline' && timeline('timeline-mobile')}
      </div>

      {state.tutorialStep >= 0 && state.tutorialStep < TUTORIAL_STEPS.length && (
        <div className="tutorial-tip" role="status">
          <span>{TUTORIAL_STEPS[state.tutorialStep].text}</span>
          <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'TUTORIAL_NEXT' })}>
            下一步
          </button>
          <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'TUTORIAL_DONE' })}>
            跳过引导
          </button>
        </div>
      )}

      {hotspotOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={`调查${hotspotOpen.label}`}>
          <div className="overlay-card">
            <h2>
              {CARROAGES.find((car) => car.id === hotspotOpen.location)?.fullName} · {hotspotOpen.label}
            </h2>
            <p className="ev-text">{hotspotOpen.hint}</p>
            {hotspotOpen.evidence.map((id) => {
              const item = evidenceOf(id) as EvidenceItem;
              const found = isDiscovered(state, id);
              return (
                <div key={id} className="cmp-slot filled">
                  <strong>
                    {id} {found ? item.title : (item.pendingTitle ?? item.title)}
                  </strong>
                  {found ? (
                    <>
                      <p className="clue-empty" style={{ margin: '4px 0 0' }}>
                        已取得，重复调查不会得到第二张。
                      </p>
                      <div className="ev-actions">
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => {
                            setDetailEvidenceId(item.id);
                            setDetailTab('evidence');
                            setHotspotOpenId(null);
                            setDetailOpenMobile(true);
                          }}
                        >
                          查看原文
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="ev-actions">
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={() => investigateEvidence(item)}
                      >
                        查看并收下记录
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="menu-actions">
              <button type="button" className="btn btn-small" onClick={() => setHotspotOpenId(null)}>
                关闭（Esc）
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'help' && <HelpModal onClose={() => setModal(null)} onRestartTutorial={restartTutorial} />}
      {modal === 'settings' && (
        <SettingsModal
          state={state}
          importError={importError}
          onToggleSound={(value) => dispatch({ type: 'SET_PREFS', prefs: { sound: value } })}
          onToggleMotion={(value) => dispatch({ type: 'SET_PREFS', prefs: { motion: value } })}
          onExport={handleExport}
          onImportClick={() => fileInputRef.current?.click()}
          onDelete={handleDeleteSave}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'hints' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="提示">
          <div className="overlay-card">
            <h2>提示</h2>
            {state.hintLevel === 0 && (
              <p className="clue-empty">提示按层级展开，下一层会比上一层更接近答案。</p>
            )}
            {HINT_LAYERS.slice(0, state.hintLevel).map((layer, index) => (
              <p key={index} className="hint-box">
                {layer}
              </p>
            ))}
            {state.hintLevel < HINT_LAYERS.length && (
              <div className="menu-actions">
                <button type="button" className="btn" onClick={() => dispatch({ type: 'OPEN_HINT' })}>
                  展开第 {state.hintLevel + 1} 层（将更接近答案）
                </button>
              </div>
            )}
            <div className="menu-actions">
              <button type="button" className="btn btn-small" onClick={() => setModal(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      {modal === 'uninvestigated' && (
        <UninvestigatedModal investigated={investigatedHotspotIds} onClose={() => setModal(null)} />
      )}
      {modal === 'hypothesis' && (
        <HypothesisModal
          sound={state.prefs.sound}
          onCreate={(fragment) => {
            dispatch({ type: 'ADD_HYPOTHESIS', fragment });
            dispatch({
              type: 'PLACE_CARD',
              placement: {
                id: '',
                cardKind: 'hypothesis',
                refId: fragment.id,
                lane: fragment.person,
                t: fragment.from.t,
              },
            });
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {fileInput}
    </div>
  );
};

const serializeState = (state: InvestigationState) => ({
  phase: state.phase,
  discovered: state.discovered,
  selection: state.selection,
  cursorT: state.cursorT,
  placements: state.placements,
  hypothesis: state.hypothesis,
  hintLevel: state.hintLevel,
  solvedAt: state.solvedAt,
  startedAt: state.startedAt,
  stats: state.stats,
});

declare global {
  interface Window {
    __train_debug__?: ReturnType<typeof serializeState>;
  }
}
