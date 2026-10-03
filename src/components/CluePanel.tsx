import { EVIDENCE, PEOPLE } from '../content/case-001';
import type { EvidenceItem, PersonId } from '../content/case-001';
import { formatT } from '../content/time-origin';
import { isDiscovered } from '../state/investigation';
import type { HypothesisFragment, InvestigationState, ReasoningNote } from '../state/investigation';

interface CluePanelProps {
  state: InvestigationState;
  onFilter: (filter: InvestigationState['filter']) => void;
  onOpenDetail: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onOpenHypothesis: () => void;
  onRemoveHypothesis: (id: string) => void;
  onRemoveNote: (index: number) => void;
  onActivateHypothesis: (id: string) => void;
  onRestoreNote: (note: ReasoningNote) => void;
}

const KIND_TAG: Record<EvidenceItem['kind'], string> = {
  record: '记录',
  testimony: '证词',
  physical: '实物确认',
};

export const CluePanel = ({
  state,
  onFilter,
  onOpenDetail,
  onToggleSelection,
  onOpenHypothesis,
  onRemoveHypothesis,
  onRemoveNote,
  onActivateHypothesis,
  onRestoreNote,
}: CluePanelProps) => {
  const items = EVIDENCE.filter((item) => isDiscovered(state, item.id));
  const filtered = items.filter((item) => {
    if (state.filter.person && !item.involves.includes(state.filter.person)) return false;
    if (state.filter.kind && item.kind !== state.filter.kind) return false;
    return true;
  });

  return (
    <aside className="clue-panel" aria-label="线索列表">
      <h2 className="panel-heading">线索（{items.length}/{EVIDENCE.length}）</h2>
      <div className="clue-filters">
        <label>
          人物筛选
          <select
            value={state.filter.person ?? ''}
            onChange={(event) =>
              onFilter({ ...state.filter, person: (event.target.value || null) as PersonId | null })
            }
          >
            <option value="">全部</option>
            {PEOPLE.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          类型筛选
          <select
            value={state.filter.kind ?? ''}
            onChange={(event) =>
              onFilter({
                ...state.filter,
                kind: (event.target.value || null) as EvidenceItem['kind'] | null,
              })
            }
          >
            <option value="">全部</option>
            <option value="record">记录</option>
            <option value="testimony">证词</option>
            <option value="physical">实物确认</option>
          </select>
        </label>
      </div>
      <div className="clue-list">
        {filtered.length === 0 && items.length > 0 && (
          <p className="clue-empty">当前筛选下没有线索，试着放开筛选条件。</p>
        )}
        {items.length === 0 && (
          <p className="clue-empty">
            还没有线索。去地图上选择车厢里的热点开展调查，或在“询问”里找四名当事人谈话。
          </p>
        )}
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`clue-item ${state.selection.includes(item.id) ? 'selected' : ''}`}
            draggable={item.recordedAt !== null}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                'text/plain',
                JSON.stringify({ cardKind: 'evidence', refId: item.id, from: 'list' }),
              );
              event.dataTransfer.effectAllowed = 'move';
            }}
          >
            <button
              type="button"
              className="clue-item-top"
              style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', minHeight: 0 }}
              onClick={() => onOpenDetail(item.id)}
            >
              <span className="clue-id">{item.id}</span>
              <span className="clue-title">{item.title}</span>
            </button>
            <span className="clue-item-top">
              <span className={`kind-tag ${item.kind}`}>{KIND_TAG[item.kind]}</span>
              {item.recordedAt !== null && (
                <span className="mono" style={{ marginLeft: 'auto' }}>
                  {item.claims && item.claims.length > 1
                    ? `${item.claims.length} 处声称`
                    : '1 处声称'}
                </span>
              )}
              {item.recordedAt === null && (
                <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>无时刻</span>
              )}
            </span>
            <span className="clue-item-actions">
              <button
                type="button"
                className={`btn btn-small ${state.selection.includes(item.id) ? 'btn-primary' : ''}`}
                aria-pressed={state.selection.includes(item.id)}
                onClick={() => onToggleSelection(item.id)}
              >
                对照
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => onOpenDetail(item.id)}
              >
                详情
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={item.recordedAt === null}
                draggable={false}
                title={item.recordedAt === null ? '该记录没有事件窗口内的时刻，不能放入时间轴' : '拖动本卡片到人物轨道，或在详情中放入'}
                onClick={() => onOpenDetail(item.id)}
              >
                拖我上轴
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="clue-list">
        <h3 className="panel-heading" style={{ border: 0, padding: '8px 0 0' }}>
          假设片段
        </h3>
        {state.hypothesis.length === 0 && (
          <p className="clue-empty">
            假设是你自己指定的“如果他在这个时刻在这里”，始终标为假设，不当作事实。
          </p>
        )}
        {state.hypothesis.map((fragment: HypothesisFragment) => (
          <div
            key={fragment.id}
            className={`clue-item ${state.selection.includes(fragment.id) ? 'selected' : ''}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(
                'text/plain',
                JSON.stringify({ cardKind: 'hypothesis', refId: fragment.id, from: 'list' }),
              );
              event.dataTransfer.effectAllowed = 'move';
            }}
          >
            <span className="clue-item-top">
              <span className="kind-tag" style={{ borderColor: 'var(--hypothesis)', color: 'var(--hypothesis)', background: 'var(--hypothesis-soft)' }}>
                假设
              </span>
              <span className="clue-title">
                {PEOPLE.find((person) => person.id === fragment.person)?.name}
              </span>
            </span>
            <span className="clue-item-top mono">
              {fragment.from.location} {formatT(fragment.from.t)}
              {fragment.to && ` → ${fragment.to.location} ${formatT(fragment.to.t)}`}
            </span>
            {fragment.note && <span className="clue-empty">{fragment.note}</span>}
            <span className="clue-item-actions">
              <button
                type="button"
                className="btn btn-small"
                aria-pressed={state.selection.includes(fragment.id)}
                onClick={() => onToggleSelection(fragment.id)}
              >
                对照
              </button>
              {fragment.to && (
                <button
                  type="button"
                  className={`btn btn-small ${fragment.active ? 'btn-primary' : ''}`}
                  aria-pressed={Boolean(fragment.active)}
                  title="只有在历史对照里被明确选中的假设路线，才会显示模拟移动"
                  onClick={() => onActivateHypothesis(fragment.id)}
                >
                  {fragment.active ? '候选路线（已启用）' : '设为候选路线'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-small"
                onClick={() => onRemoveHypothesis(fragment.id)}
              >
                删除
              </button>
            </span>
          </div>
        ))}
        <button type="button" className="btn" onClick={onOpenHypothesis}>
          新建假设片段
        </button>
      </div>
      {state.reasoningNotes.length > 0 && (
        <div className="clue-list">
          <h3 className="panel-heading" style={{ border: 0, padding: '8px 0 0' }}>
            推理笔记（钉存的对照结论）
          </h3>
          {state.reasoningNotes.map((note, index) => (
            <div key={note.id} className="clue-item">
              <span className="clue-empty">
                <strong>{note.labelA} ↔ {note.labelB}</strong>
                <br />
                {note.conclusion}
              </span>
              <span className="clue-item-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!note.evidenceA || !note.evidenceB}
                  title={note.evidenceA && note.evidenceB ? '把这两张证据放回对照' : '该对照含假设，无法直接恢复'}
                  onClick={() => onRestoreNote(note)}
                >
                  恢复对照
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => onRemoveNote(index)}
                >
                  删除
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
