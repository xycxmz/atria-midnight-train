import { useState } from 'react';
import {
  EVIDENCE,
  LOCATION_OPTIONS,
  OBJECT_OPTIONS,
  PERSON_OPTIONS,
  STASH_OPTIONS,
} from '../content/case-001';
import { formatT, parseT } from '../content/time-origin';
import type { VerdictResult } from '../domain/verdict';
import type { VerdictDraft } from '../state/investigation';

export interface VerdictSubmission {
  person: string;
  eventLocation: string;
  eventT: number;
  object: string;
  stash: string;
  selectedEvidence: string[];
}

interface VerdictPanelProps {
  discovered: string[];
  draft: VerdictDraft;
  lastResult: VerdictResult | null;
  onDraftChange: (draft: Partial<VerdictDraft>) => void;
  onSubmit: (submission: VerdictSubmission) => void;
}

const SLOT_GUIDE: Array<{ label: string; hint: string }> = [
  { label: '对象与时刻', hint: '锁定哪件物件、在哪个车厢、何时被取走。' },
  { label: '人物', hint: '用通行记录排除其他人，并证明钥匙等条件成立。' },
  { label: '证词问题', hint: '找到通行规则与该人物自相矛盾的两处陈述。' },
  { label: '地点与找回', hint: '找到藏匿位置的记录并亲自找回物件。' },
];

export const VerdictPanel = ({ discovered, draft, lastResult, onDraftChange, onSubmit }: VerdictPanelProps) => {
  const { person, eventLocation, timeLabel, object, stash } = draft;
  const chain = draft.selectedEvidence;
  const [timeError, setTimeError] = useState('');

  const e12Found = discovered.includes('E12');
  // 固定事件记录选择：已发现的带时刻记录可直接填入。
  const fixedTimes = EVIDENCE.filter(
    (item) => discovered.includes(item.id) && item.recordedAt !== null && item.id !== 'E02',
  );

  const toggleChain = (id: string) => {
    const current = draft.selectedEvidence;
    onDraftChange({
      selectedEvidence: current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    });
  };

  const handleSubmit = () => {
    const parsed = parseT(timeLabel);
    if (!parsed.ok) {
      setTimeError(parsed.message);
      return;
    }
    setTimeError('');
    onDraftChange({ eventT: parsed.t });
    onSubmit({
      person,
      eventLocation,
      eventT: parsed.t,
      object,
      stash,
      selectedEvidence: chain,
    });
  };

  const canSubmit = person !== '' && eventLocation !== '' && timeLabel !== '' && object !== '' && stash !== '';

  return (
    <div className="vd-panel">
      <h2 className="panel-heading" style={{ border: 0, padding: 0 }}>
        结案
      </h2>
      <p className="clue-empty">
        四个槽位：对象与时刻、人物、证词问题、地点与找回。提交只检查你的选择是否被证据支持，答错不扣分、不重置调查。
      </p>
      <ul className="uninvestigated" style={{ padding: 0 }}>
        {SLOT_GUIDE.map((slot) => (
          <li key={slot.label}>
            <strong>{slot.label}</strong>：{slot.hint}
          </li>
        ))}
      </ul>
      <div className="vd-field">
        <label htmlFor="vd-person">取走物件的人物</label>
        <select id="vd-person" value={person} onChange={(event) => onDraftChange({ person: event.target.value })}>
          <option value="">选择人物…</option>
          {PERSON_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="vd-field">
        <label htmlFor="vd-location">取走地点</label>
        <select id="vd-location" value={eventLocation} onChange={(event) => onDraftChange({ eventLocation: event.target.value })}>
          <option value="">选择车厢…</option>
          {LOCATION_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="vd-field">
        <label htmlFor="vd-time">取走时刻（时:分:秒）</label>
        <input
          id="vd-time"
          className="mono"
          placeholder="23:58:30"
          value={timeLabel}
          onChange={(event) => onDraftChange({ timeLabel: event.target.value, eventT: null })}
          aria-invalid={timeError !== ''}
        />
        {fixedTimes.length > 0 && (
          <div className="vd-evidence" style={{ marginTop: 4 }}>
            {fixedTimes.map((item) => (
              <button
                key={item.id}
                type="button"
                className="btn btn-small"
                onClick={() => {
                  onDraftChange({ timeLabel: formatT(item.recordedAt as number) });
                  setTimeError('');
                }}
              >
                {item.id} {formatT(item.recordedAt as number)}
              </button>
            ))}
          </div>
        )}
        {timeError && <p className="vd-warning">{timeError}</p>}
      </div>
      <div className="vd-field">
        <label htmlFor="vd-object">物件</label>
        <select id="vd-object" value={object} onChange={(event) => onDraftChange({ object: event.target.value })}>
          <option value="">选择物件…</option>
          {OBJECT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="vd-field">
        <label htmlFor="vd-stash">藏匿地点</label>
        <select id="vd-stash" value={stash} onChange={(event) => onDraftChange({ stash: event.target.value })}>
          <option value="">选择地点…</option>
          {STASH_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="vd-field">
        <span className="vd-field-label" id="chain-label">
          支持链：选中支撑你结论的证据
        </span>
        <div className="vd-evidence" role="group" aria-labelledby="chain-label">
          {EVIDENCE.filter((item) => discovered.includes(item.id)).map((item) => (
            <button
              key={item.id}
              type="button"
              className="ev-chip"
              aria-pressed={chain.includes(item.id)}
              title={`${item.id} ${item.title} · ${item.source}`}
              onClick={() => toggleChain(item.id)}
            >
              {item.id} · {item.title}
            </button>
          ))}
        </div>
      </div>
      {!e12Found && (
        <p className="vd-warning">
          结案前必须先找回物件本体：找到并打开藏匿它的容器，取得实物确认后才能提交最终结案。
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={!canSubmit || !e12Found}
      >
        提交结案
      </button>
      {lastResult && (
        <div>
          {lastResult.slots.map((slot) => (
            <p
              key={slot.slotId}
              className={`vd-slot-feedback ${slot.supported ? 'ok' : 'bad'}`}
              aria-live="polite"
            >
              <span aria-hidden="true">{slot.supported ? '✓' : '!'}</span>
              <span>
                <strong>{slot.label}</strong>：{slot.reason}
              </span>
            </p>
          ))}
          {!lastResult.solved && (
            <p className="ev-layer-note">
              提交被退回，调查进度、笔记与布置全部保留。修改选择后可以再次提交，没有次数限制。
            </p>
          )}
        </div>
      )}
    </div>
  );
};
