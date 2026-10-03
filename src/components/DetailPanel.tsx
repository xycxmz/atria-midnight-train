import { PEOPLE } from '../content/case-001';
import type { EvidenceItem, PersonId } from '../content/case-001';
import { EvidenceCard } from './EvidenceCard';
import { ComparePanel } from './ComparePanel';
import type { CompareClaim } from './ComparePanel';
import { VerdictPanel } from './VerdictPanel';
import type { VerdictSubmission } from './VerdictPanel';
import type { InvestigationState, ReasoningNote } from '../state/investigation';

export type DetailTab = 'evidence' | 'compare' | 'ask' | 'verdict';

interface DetailPanelProps {
  state: InvestigationState;
  tab: DetailTab;
  setTab: (tab: DetailTab) => void;
  detailItem: EvidenceItem | null;
  detailItemMatched: boolean;
  detailItemPending: boolean;
  onToggleCompare: () => void;
  onRequestPlacement: () => void;
  onToggleDoubt: () => void;
  onSaveNote: (note: string) => void;
  compareClaims: CompareClaim[];
  compareTitles: string[];
  onClearCompare: () => void;
  onPinNote: (note: ReasoningNote) => void;
  askPerson: PersonId | null;
  setAskPerson: (personId: PersonId | null) => void;
  askAnswer: { person: PersonId; answer: string; evidence?: string; tone: string } | null;
  onAskTopic: (personId: PersonId, topicId: string) => void;
  onVerdict: (submission: VerdictSubmission) => void;
  verdictDraft: InvestigationState['verdictDraft'];
  onVerdictDraftChange: (draft: Partial<InvestigationState['verdictDraft']>) => void;
  detailOpenMobile: boolean;
  onCloseMobile: () => void;
}

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'evidence', label: '证据卡' },
  { id: 'compare', label: '对照' },
  { id: 'ask', label: '询问' },
  { id: 'verdict', label: '结案' },
];

export const DetailPanel = ({
  state,
  tab,
  setTab,
  detailItem,
  detailItemMatched,
  detailItemPending,
  onToggleCompare,
  onRequestPlacement,
  onToggleDoubt,
  onSaveNote,
  compareClaims,
  compareTitles,
  onClearCompare,
  onPinNote,
  askPerson,
  setAskPerson,
  askAnswer,
  onAskTopic,
  onVerdict,
  verdictDraft,
  onVerdictDraftChange,
  detailOpenMobile,
  onCloseMobile,
}: DetailPanelProps) => {
  const tabs = TABS.map((entry) => ({
    ...entry,
    label: entry.id === 'compare' && state.selection.length > 0 ? `对照（${state.selection.length}）` : entry.label,
  }));
  return (
    <section
      className={`detail-panel detail-overlay-anchor ${detailOpenMobile ? 'mobile-open' : ''}`}
      aria-label="详情面板"
    >
      <div className="detail-tabs" role="tablist" aria-label="详情页签">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className={`btn btn-small tab ${tab === entry.id ? 'btn-primary' : ''}`}
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        <button type="button" className="btn btn-small detail-close" onClick={onCloseMobile} aria-label="关闭详情">
          关闭
        </button>
      </div>
      <div className="detail-tab-body" role="tabpanel">
        {tab === 'evidence' &&
          (detailItem ? (
            <div className="evidence-detail">
              <EvidenceCard
                item={detailItem}
                matched={detailItemMatched}
                selectedForCompare={state.selection.includes(detailItem.id)}
                placed={state.placements.some((p) => p.refId === detailItem.id)}
                pendingPlacement={detailItemPending}
                doubt={Boolean(state.doubt[detailItem.id])}
                note={state.notes[detailItem.id] ?? ''}
                onToggleCompare={onToggleCompare}
                onRequestPlacement={onRequestPlacement}
                onToggleDoubt={onToggleDoubt}
                onSaveNote={onSaveNote}
              />
              {detailItem.recordedAt === null && (
                <p className="ev-layer-note">
                  这张卡没有事件窗口内的时刻，不能放上时间轴；它作为规则或实物依据使用。
                </p>
              )}
            </div>
          ) : (
            <p className="clue-empty" style={{ padding: 16 }}>
              从左侧选中一张卡片查看原文、来源、记录时刻与可信类型；也可以在这里标记存疑或写下笔记。
            </p>
          ))}

        {tab === 'compare' && (
          <ComparePanel
            claims={compareClaims}
            cardTitles={compareTitles}
            onClear={onClearCompare}
            onPinNote={onPinNote}
          />
        )}

        {tab === 'ask' && (
          <div className="ask-panel">
            <h2 className="panel-heading" style={{ border: 0, padding: 0 }}>
              询问当事人
            </h2>
            <p className="clue-empty">
              人物现在所在的车厢是他们调查时的位置，不是事件发生时的位置。证词与记录分两层，证词可能错误。
            </p>
            <div className="person-picker" role="group" aria-label="选择要询问的人物">
              {PEOPLE.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="person-row"
                  aria-pressed={askPerson === person.id}
                  onClick={() => {
                    setAskPerson(askPerson === person.id ? null : person.id);
                  }}
                >
                  <span className="clue-id">{person.initial}</span>
                  <span>
                    <strong>{person.name}</strong> · {person.role}
                  </span>
                  <span style={{ marginLeft: 'auto' }} className="clue-empty">
                    现于 {person.currentLocation} 车
                  </span>
                </button>
              ))}
            </div>
            {askPerson && (
              <div className="topic-list">
                {PEOPLE.find((person) => person.id === askPerson)?.topics.map((topic) => {
                  const obtained = topic.evidence ? state.discovered.includes(topic.evidence) : false;
                  return (
                    <div key={topic.id}>
                      <button
                        type="button"
                        className="topic-btn"
                        onClick={() => onAskTopic(askPerson, topic.id)}
                      >
                        {topic.question}
                        {obtained ? '（已取得该证词卡）' : ''}
                      </button>
                    </div>
                  );
                })}
                {askAnswer && askAnswer.person === askPerson && (
                  <p className={`answer-box ${askAnswer.tone === 'record' ? 'record-tone' : ''}`}>
                    {askAnswer.answer}
                    {askAnswer.evidence && (
                      <>
                        <br />
                        <strong>
                          {state.discovered.includes(askAnswer.evidence)
                            ? `已收下证词卡 ${askAnswer.evidence}。`
                            : `正在收下证词卡 ${askAnswer.evidence}…`}
                        </strong>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'verdict' && (
          <VerdictPanel
            discovered={state.discovered}
            draft={verdictDraft}
            lastResult={state.lastVerdict}
            onDraftChange={onVerdictDraftChange}
            onSubmit={onVerdict}
          />
        )}
      </div>
    </section>
  );
};
