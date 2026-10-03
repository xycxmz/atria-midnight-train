import { useState } from 'react';
import { PEOPLE } from '../content/case-001';
import type { EvidenceItem } from '../content/case-001';
import { formatT } from '../content/time-origin';

interface EvidenceCardProps {
  item: EvidenceItem;
  matched: boolean;
  selectedForCompare: boolean;
  placed: boolean;
  pendingPlacement: boolean;
  doubt: boolean;
  note: string;
  onToggleCompare: () => void;
  onRequestPlacement: () => void;
  onToggleDoubt: () => void;
  onSaveNote: (note: string) => void;
  onClose?: () => void;
}

const KIND_LABEL: Record<EvidenceItem['kind'], string> = {
  record: '记录',
  testimony: '证词',
  physical: '实物确认',
};

const LAYER_NOTE: Record<EvidenceItem['kind'], string> = {
  record: '本卡是列车系统的独立记录：原文固定、可回查，不会因为你的怀疑而改变。',
  testimony: '本卡是人物证词。证词可能错误，需要与记录对照，不能单独当作事实。',
  physical: '本卡是你亲自查看得到的实物确认，编号与记录核对一致。',
};

export const EvidenceCard = ({
  item,
  matched,
  selectedForCompare,
  placed,
  pendingPlacement,
  doubt,
  note,
  onToggleCompare,
  onRequestPlacement,
  onToggleDoubt,
  onSaveNote,
}: EvidenceCardProps) => {
  const [noteDraft, setNoteDraft] = useState(note);
  const showPendingText = item.id === 'E12' && !matched;
  const displayText = showPendingText ? item.pendingMatchText ?? item.text : item.text;

  return (
    <article className="ev-card" aria-labelledby={`ev-title-${item.id}`}>
      <header className="ev-head">
        <h3 className="ev-title" id={`ev-title-${item.id}`}>
          {item.id} · {item.title}
        </h3>
        <span className={`kind-tag ${item.kind}`}>{KIND_LABEL[item.kind]}</span>
      </header>
      <div className="ev-meta">
        <span>来源：{item.source}</span>
        {item.recordedAt !== null && (
          <span>
            记录时刻：<span className="mono">{formatT(item.recordedAt)}</span>
          </span>
        )}
        <span>
          涉及：
          {item.involves.length > 0
            ? item.involves
                .map((personId) => PEOPLE.find((person) => person.id === personId)?.name ?? personId)
                .join('、')
            : '记录未指明'}
        </span>
      </div>
      <p className="ev-text">{displayText}</p>
      <p className={`ev-layer-note ${item.kind === 'testimony' ? 'testimony' : ''}`}>{LAYER_NOTE[item.kind]}</p>
      {doubt && (
        <p className="ev-layer-note doubt">
          已标为“存疑”。这是你的个人笔记，系统并未确认这张卡虚假。
        </p>
      )}
      <label className="sr-only" htmlFor={`note-${item.id}`}>
        关于 {item.id} 的个人笔记
      </label>
      <textarea
        id={`note-${item.id}`}
        className="ev-note-area"
        placeholder="个人笔记：这里记下你的猜测与理由（不参与自动评分）"
        value={noteDraft}
        onChange={(event) => setNoteDraft(event.target.value)}
        onBlur={() => onSaveNote(noteDraft)}
      />
      <div className="ev-actions">
        <button
          type="button"
          className={`btn btn-small ${selectedForCompare ? 'btn-primary' : ''}`}
          aria-pressed={selectedForCompare}
          onClick={onToggleCompare}
        >
          {selectedForCompare ? '已加入对照' : '加入对照'}
        </button>
        <button
          type="button"
          className={`btn btn-small ${pendingPlacement ? 'btn-primary' : ''}`}
          aria-pressed={pendingPlacement}
          onClick={onRequestPlacement}
        >
          {pendingPlacement ? '请选择一条轨道' : placed ? '更换轨道' : '放入时间轴'}
        </button>
        <button
          type="button"
          className={`btn btn-small ${doubt ? 'btn-danger' : ''}`}
          aria-pressed={doubt}
          onClick={onToggleDoubt}
        >
          {doubt ? '取消存疑' : '标记存疑'}
        </button>
      </div>
    </article>
  );
};
