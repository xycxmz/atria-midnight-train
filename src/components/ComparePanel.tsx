import { useMemo, useState } from 'react';
import { PEOPLE } from '../content/case-001';
import type { LocationId, PersonId } from '../content/case-001';
import { EDGES } from '../content/case-001';
import { formatT } from '../content/time-origin';
import { compareClaims, checkRecordAgainstEvent } from '../domain/constraints';
import type { SpotClaim } from '../domain/constraints';

export interface CompareClaim {
  person: PersonId | null;
  location: LocationId;
  t: number;
  kind: SpotClaim['kind'];
  evidenceId?: string;
  origin: string;
}

import type { ReasoningNote } from '../state/investigation';

interface ComparePanelProps {
  claims: CompareClaim[];
  cardTitles: string[];
  onClear: () => void;
  onPinNote: (note: ReasoningNote) => void;
}

const CARRIAGE_NAME: Record<LocationId, string> = {
  S: 'S 会客车',
  D: 'D 餐车',
  L: 'L 行李车',
};

const KIND_CN: Record<SpotClaim['kind'], string> = {
  record: '记录',
  testimony: '证词',
  hypothesis: '假设',
};

const personName = (person: PersonId | null): string =>
  person === null ? '已确定事件' : PEOPLE.find((candidate) => candidate.id === person)?.name ?? '';

// 稳定键：不随数组顺序或渲染次数变化，端点选择因此不会被无关操作重置
const claimKey = (claim: CompareClaim): string =>
  `${claim.person ?? 'event'}|${claim.location}|${claim.t}|${claim.origin}`;

const claimLabel = (claim: CompareClaim): string =>
  `${personName(claim.person)} · ${KIND_CN[claim.kind]} · ${CARRIAGE_NAME[claim.location]} · ${formatT(claim.t)}`;

export const ComparePanel = ({ claims, cardTitles, onClear, onPinNote }: ComparePanelProps) => {
  const sorted = useMemo(() => [...claims].sort((a, b) => a.t - b.t), [claims]);

  const defaultKeys = useMemo(() => {
    if (sorted.length < 2) return [null, null] as Array<string | null>;
    // 优先同一人的相邻两段（如 E09 的两处陈述）
    for (let index = 0; index < sorted.length - 1; index += 1) {
      if (sorted[index].person !== null && sorted[index].person === sorted[index + 1].person) {
        return [claimKey(sorted[index]), claimKey(sorted[index + 1])];
      }
    }
    return [claimKey(sorted[0]), claimKey(sorted[1])];
  // 只依赖键集合，避免无关渲染重算身份
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims]);

  const [endKeyA, setEndKeyA] = useState<string | null>(null);
  const [endKeyB, setEndKeyB] = useState<string | null>(null);

  // 端点按键解析：所选键仍在列表里就保持，只有消失时才回退默认（如该证据被移出选择）
  const indexOfKey = (key: string | null): number =>
    key === null ? -1 : sorted.findIndex((claim) => claimKey(claim) === key);
  // 端点按键解析：所选键仍在列表里就保持，只有消失时才回退默认（如该证据被移出选择）
  const indexA = indexOfKey(endKeyA) >= 0 ? indexOfKey(endKeyA) : indexOfKey(defaultKeys[0]);
  const indexB = indexOfKey(endKeyB) >= 0 ? indexOfKey(endKeyB) : indexOfKey(defaultKeys[1]);
  const finalA = indexA >= 0 ? sorted[indexA] : sorted[0];
  const finalB = indexB >= 0 ? sorted[indexB] : sorted[Math.min(1, sorted.length - 1)];

  if (sorted.length === 0) {
    return (
      <div className="cmp-panel">
        <h2 className="panel-heading" style={{ border: 0, padding: 0 }}>
          对照
        </h2>
        <p className="clue-empty">
          对照有两种动作：同一人的两段行程，或人物记录与已确定事件（如展匣开启）。
          先选中带时间地点的卡片——记录、证词或假设片段都行。对照器只比较时空，不指认嫌疑人。
        </p>
      </div>
    );
  }

  if (sorted.length === 1) {
    return (
      <div className="cmp-panel">
        <h2 className="panel-heading" style={{ border: 0, padding: 0 }}>
          对照
        </h2>
        <div className="cmp-slot filled">
          <strong>{sorted[0].origin}</strong>：{KIND_CN[sorted[0].kind]} · {CARRIAGE_NAME[sorted[0].location]} ·{' '}
          <span className="mono">{formatT(sorted[0].t)}</span>
        </div>
        <p className="clue-empty">
          再选中同一人的另一条记录做“两段行程”对照；或选中展匣开启条（E07）这类已确定事件，
          比较“这条记录的人物能否在事件时刻赶到事件地点”。
        </p>
        <button type="button" className="btn btn-small" onClick={onClear}>
          清空选择
        </button>
      </div>
    );
  }

  const options = sorted.map((claim) => (
    <option key={claimKey(claim)} value={claimKey(claim)}>
      {claimLabel(claim)}
    </option>
  ));

  const a = finalA;
  const b = finalB;
  const selectValueA = endKeyA !== null && indexOfKey(endKeyA) >= 0 ? endKeyA : (defaultKeys[0] ?? '');
  const selectValueB = endKeyB !== null && indexOfKey(endKeyB) >= 0 ? endKeyB : (defaultKeys[1] ?? '');
  const safeSelect = (value: string | null): string => value ?? '';
  const persons = new Set(sorted.map((claim) => claim.person).filter((person): person is PersonId => person !== null));
  const hasCrossSubjectNotice = persons.size > 1 || (persons.size === 1 && a.person !== b.person);

  let body: React.ReactNode;
  if (a.person === null || b.person === null) {
    // 事件对照：人物记录 vs 已确定事件
    const eventClaim = a.person === null ? a : b;
    const recordClaim = a.person === null ? b : a;
    if (recordClaim.person === null) {
      body = (
        <p className="cmp-verdict">
          两端都是已确定事件，没有人物记录可供比较。请选一条人物的位置记录作为另一端。
        </p>
      );
    } else {
      const verdict = checkRecordAgainstEvent(
        { ...recordClaim, person: recordClaim.person },
        { location: eventClaim.location, t: eventClaim.t },
        EDGES,
      );
      const ok = verdict.compatible;
      body = (
        <div>
          <dl className="cmp-rows">
            <dt>事件</dt>
            <dd>
              {eventClaim.evidenceId ?? '事件'} · {CARRIAGE_NAME[eventClaim.location]} · {formatT(eventClaim.t)}
            </dd>
            <dt>人物记录</dt>
            <dd>
              {personName(recordClaim.person)} · {KIND_CN[recordClaim.kind]} · {CARRIAGE_NAME[recordClaim.location]} ·{' '}
              {formatT(recordClaim.t)}
            </dd>
            <dt>时间差</dt>
            <dd>{verdict.availableSeconds} 秒</dd>
            <dt>赶到事件地点所需</dt>
            <dd>{verdict.requiredSeconds} 秒</dd>
          </dl>
          <p className={`cmp-verdict ${ok ? 'ok' : ''}`}>
            {ok
              ? `${personName(recordClaim.person)}的这条记录与已确定事件兼容——只是“不矛盾”，不等于其在场。`
              : `${personName(recordClaim.person)}的这条记录与已确定事件不相容：只有 ${verdict.availableSeconds} 秒，而赶到需要 ${verdict.requiredSeconds} 秒。`}
          </p>
        </div>
      );
    }
  } else if (a.person !== b.person) {
    body = (
      <p className="cmp-verdict">
        这两条记录的主体不同（{personName(a.person)}与{personName(b.person)}），不能据此判断行程矛盾：
        两人同时分处两地本是常事。行程矛盾只能在同一个人的两段陈述之间判断。
      </p>
    );
  } else {
    const result = compareClaims(
      { ...a, person: a.person },
      { ...b, person: b.person },
      EDGES,
    );
    body = (
      <div>
        <dl className="cmp-rows">
          <dt>较早一段</dt>
          <dd>
            {personName(a.person)} · {KIND_CN[a.kind]} · {CARRIAGE_NAME[a.location]} · {formatT(a.t)}
          </dd>
          <dt>较晚一段</dt>
          <dd>
            {personName(b.person)} · {KIND_CN[b.kind]} · {CARRIAGE_NAME[b.location]} · {formatT(b.t)}
          </dd>
          <dt>地点距离</dt>
          <dd>
            {result.hops} 段车厢（{CARRIAGE_NAME[a.location]} ↔ {CARRIAGE_NAME[b.location]}）
          </dd>
          <dt>最短用时</dt>
          <dd>{result.travelSeconds} 秒</dd>
          <dt>可用时间</dt>
          <dd>{result.availableSeconds} 秒</dd>
          <dt>时间差额</dt>
          <dd>
            {result.possible
              ? `足够（余 ${result.availableSeconds - result.travelSeconds} 秒）`
              : `缺少 ${result.shortfallSeconds} 秒`}
          </dd>
        </dl>
        <p className={`cmp-verdict ${result.possible ? 'ok' : ''}`}>
          {result.possible
            ? '这两条说法在通行规则下可以同时成立——但这只是“不矛盾”，不等于证实其中任何一条。'
            : `这两条说法不能同时成立：最短需要 ${result.travelSeconds} 秒，只有 ${result.availableSeconds} 秒可用，缺少 ${result.shortfallSeconds} 秒。`}
        </p>
      </div>
    );
  }

  const mode: ReasoningNote['mode'] =
    a.person === null || b.person === null ? 'event' : a.person !== b.person ? 'cross' : 'trip';
  const modeText = mode === 'event' ? '事件对照' : mode === 'cross' ? '跨主体（不可比）' : '行程对照';

  const note: ReasoningNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    mode,
    labelA: claimLabel(a),
    labelB: claimLabel(b),
    evidenceA: a.evidenceId,
    evidenceB: b.evidenceId,
    required: null,
    available: null,
    delta: null,
    conclusion: '',
    createdAt: Date.now(),
  };
  if (mode === 'event' && a.person !== null && b.person !== null) {
    const recordClaim = a.person === null ? b : a;
    const eventClaim = a.person === null ? a : b;
    const verdict = checkRecordAgainstEvent(
      { ...recordClaim, person: recordClaim.person as string },
      { location: eventClaim.location, t: eventClaim.t },
      EDGES,
    );
    note.required = verdict.requiredSeconds;
    note.available = verdict.availableSeconds;
    note.delta = verdict.requiredSeconds - verdict.availableSeconds;
    note.conclusion = verdict.compatible
      ? `${personName(recordClaim.person)}的记录与已确定事件兼容（差额 ${note.delta} 秒，只是不矛盾，不等于其在场）`
      : `${personName(recordClaim.person)}的记录与已确定事件不相容：只有 ${verdict.availableSeconds} 秒，赶到需要 ${verdict.requiredSeconds} 秒`;
  } else if (mode === 'trip') {
    const result = compareClaims({ ...a, person: a.person as string }, { ...b, person: b.person as string }, EDGES);
    note.required = result.travelSeconds;
    note.available = result.availableSeconds;
    note.delta = result.shortfallSeconds || result.availableSeconds - result.travelSeconds;
    note.conclusion = result.possible
      ? `两段行程可以同时成立：最短 ${result.travelSeconds} 秒，可用 ${result.availableSeconds} 秒`
      : `两段行程不能同时成立：最短 ${result.travelSeconds} 秒，只有 ${result.availableSeconds} 秒，缺少 ${result.shortfallSeconds} 秒`;
  } else if (mode === 'cross') {
    note.conclusion = '主体不同，不能据此判断行程矛盾；两人同时分处两地本是常事';
  }

  return (
    <div className="cmp-panel">
      <h2 className="panel-heading" style={{ border: 0, padding: 0 }}>
        对照（{cardTitles.join(' 与 ')}）
      </h2>
      <div className="cmp-endpoints">
        <label>
          端点一
          <select value={safeSelect(selectValueA)} onChange={(event) => setEndKeyA(event.target.value)}>
            {options}
          </select>
        </label>
        <label>
          端点二
          <select value={safeSelect(selectValueB)} onChange={(event) => setEndKeyB(event.target.value)}>
            {options}
          </select>
        </label>
      </div>
      {body}
      {mode !== 'trip' && (
        <p className="ev-layer-note">
          本次对照为{modeText}：{mode === 'cross' ? '无法给出行程矛盾结论。' : '比较的是记录能否赶赴该事件。'}
        </p>
      )}
      {hasCrossSubjectNotice && persons.size > 1 && (
        <p className="ev-layer-note">
          所选记录涉及多位人物：{[...persons].map((person) => personName(person)).join('、')}。
          行程矛盾只能在同一人的陈述之间判断；上表只比较你选中的两个端点。
        </p>
      )}
      <p className="ev-layer-note">
        对照器只做时空计算，结论是“不能同时成立”，不是“此人作案”。证词与记录是两层证据，请在卡片标签上区分。
      </p>
      <div className="ev-actions">
        <button type="button" className="btn btn-small" onClick={() => onPinNote(note)}>
          钉为推理笔记
        </button>
        <button type="button" className="btn btn-small" onClick={onClear}>
          清空选择
        </button>
      </div>
    </div>
  );
};
