import { useEffect, useRef, useState } from 'react';
import { CARROAGES, HOTSPOTS, PEOPLE } from '../content/case-001';
import type { LocationId, PersonId } from '../content/case-001';
import { DURATION_SECONDS, formatT, parseT } from '../content/time-origin';
import { sfxCardPlaced } from '../sound/sfx';
import type { HypothesisFragment, InvestigationState } from '../state/investigation';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}

export const ModalShell = ({ title, onClose, children, ariaLabel }: ModalShellProps) => {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return (
  <div ref={panel} className="overlay" role="dialog" aria-modal="true" aria-label={ariaLabel}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? [])];
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <div className="overlay-card">
      <h2>{title}</h2>
      {children}
      <div className="menu-actions">
        <button ref={closeButton} type="button" className="btn btn-small" onClick={onClose}>
          关闭（Esc）
        </button>
      </div>
    </div>
  </div>
  );
};

interface HelpModalProps {
  onClose: () => void;
  onRestartTutorial: () => void;
}

export const HelpModal = ({ onClose, onRestartTutorial }: HelpModalProps) => (
  <ModalShell title="操作帮助" onClose={onClose} ariaLabel="操作帮助">
    <div className="clue-list">
      <p className="ev-text">
        <strong>调查</strong>：在地图上选择车厢里的热点（桌面、服务台、检修格……），每次调查可能得到一张证据卡。
        也可以在“询问”页签里与四名当事人谈话。
      </p>
      <p className="ev-text">
        <strong>时间轴</strong>：打开证据卡选“放入时间轴”，再选择一条人物轨道确认；也可以把卡片直接拖到轨道上。
        证据卡的时间固定不可拖改；要指定自己的时间，请“新建假设片段”。
      </p>
      <p className="ev-text">
        <strong>对照</strong>：选中两条带时间地点的卡片（或选中包含两处陈述的证词卡），对照器计算最短通行时间与可用时间，
        得出“能否同时成立”，不会替你指认嫌疑人。
      </p>
      <p className="ev-text">
        <strong>历史对照</strong>：把地图切到“历史对照”并拖动游标，只显示你已经发现的记录；没有记录的时段显示“位置未知”。
      </p>
      <p className="ev-text">
        <strong>结案</strong>：填四个槽位并勾选支持链。必须先找回物件本体。答错不扣分，调查进度全部保留。
      </p>
      <p className="ev-layer-note">
        键盘：Tab 移动焦点；时间游标可用左右方向键与 Home/End；卡片可用 Enter 加入对照；Escape 关闭弹层或取消放置。
      </p>
      <button type="button" className="btn" onClick={onRestartTutorial}>
        重新查看引导
      </button>
    </div>
  </ModalShell>
);

interface SettingsModalProps {
  state: InvestigationState;
  importError: string | null;
  onToggleSound: (value: boolean) => void;
  onToggleMotion: (value: boolean) => void;
  onExport: () => void;
  onImportClick: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const useConfirmDelete = () => {
  const [armed, setArmed] = useState(false);
  return {
    armed,
    arm: () => setArmed(true),
    disarm: () => setArmed(false),
    confirm: (onDelete: () => void) => {
      onDelete();
      setArmed(false);
    },
  };
};

export const SettingsModal = ({
  state,
  importError,
  onToggleSound,
  onToggleMotion,
  onExport,
  onImportClick,
  onDelete,
  onClose,
}: SettingsModalProps) => {
  const del = useConfirmDelete();
  return (
  <ModalShell title="设置 / 存档" onClose={onClose} ariaLabel="设置与存档">
    <div className="clue-list">
      <label className="clue-filters" style={{ flexDirection: 'row' }}>
        <input
          type="checkbox"
          checked={state.prefs.sound}
          onChange={(event) => onToggleSound(event.target.checked)}
        />
        收卡与对照反馈音（默认关闭）
      </label>
      <label className="clue-filters" style={{ flexDirection: 'row' }}>
        <input
          type="checkbox"
          checked={state.prefs.motion}
          onChange={(event) => onToggleMotion(event.target.checked)}
        />
        卡片与界面动画（系统开启减弱动画时自动关闭）
      </label>
      <div className="clue-item-actions">
        <button type="button" className="btn btn-small" onClick={onExport}>
          导出存档（本地文件）
        </button>
        <button type="button" className="btn btn-small" onClick={onImportClick}>
          导入存档（本地文件）
        </button>
        {del.armed ? (
          <>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => del.confirm(onDelete)}
            >
              确认删除本地存档（不可恢复）
            </button>
            <button type="button" className="btn btn-small" onClick={del.disarm}>
              取消删除
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-small btn-danger" onClick={del.arm}>
            删除本地存档并重新开始
          </button>
        )}
      </div>
      {del.armed && (
        <p className="vd-warning">
          删除前建议先导出存档。确认后本地记录会被移除，当前页面进度也会重置为新调查。
        </p>
      )}
      {importError && <p className="vd-warning">{importError}</p>}
      <p className="ev-layer-note">
        导入会先校验版本、人物、证据与时间边界，失败时不覆盖当前进度。存档只存在本机浏览器里。
      </p>
    </div>
  </ModalShell>
  );
};

interface UninvestigatedModalProps {
  investigated: Set<string>;
  onClose: () => void;
}

export const UninvestigatedModal = ({ investigated, onClose }: UninvestigatedModalProps) => {
  const pending = HOTSPOTS.filter((hotspot) => !investigated.has(hotspot.id));
  const grouped = CARROAGES.map((carriage) => ({
    carriage,
    spots: pending.filter((hotspot) => hotspot.location === carriage.id),
  })).filter((entry) => entry.spots.length > 0);

  return (
    <ModalShell title="未调查地点" onClose={onClose} ariaLabel="未调查地点列表">
      {grouped.length === 0 ? (
        <p className="ev-text">列车上的热点你都已经查看过了。</p>
      ) : (
        <>
          <p className="ev-layer-note">
            这里只说明哪里尚未查看，不暗示哪里藏着答案；没有查看顺序要求。
          </p>
          {grouped.map((entry) => (
            <div key={entry.carriage.id}>
              <h3>{entry.carriage.fullName}</h3>
              <ul className="uninvestigated">
                {entry.spots.map((spot) => (
                  <li key={spot.id}>{spot.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </ModalShell>
  );
};

interface HypothesisModalProps {
  sound: boolean;
  onCreate: (fragment: HypothesisFragment) => void;
  onClose: () => void;
}

const emptyForm = {
  person: '' as PersonId | '',
  fromLocation: '' as LocationId | '',
  fromTime: '',
  toLocation: '' as LocationId | '',
  toTime: '',
  note: '',
};

export const HypothesisModal = ({ sound, onCreate, onClose }: HypothesisModalProps) => {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const submit = () => {
    if (!form.person || !form.fromLocation || !form.fromTime) {
      setError('请选择人物、地点并填写时刻。');
      return;
    }
    const from = parseT(form.fromTime);
    if (!from.ok) {
      setError(from.message);
      return;
    }
    let to: HypothesisFragment['to'];
    if (form.toLocation || form.toTime) {
      if (!form.toLocation || !form.toTime) {
        setError('第二段地点与时刻需要同时填写，或同时留空。');
        return;
      }
      const parsedTo = parseT(form.toTime);
      if (!parsedTo.ok) {
        setError(parsedTo.message);
        return;
      }
      if (parsedTo.t < from.t) {
        setError('第二段时刻不能早于第一段。');
        return;
      }
      to = { location: form.toLocation, t: parsedTo.t };
    }
    const fragment: HypothesisFragment = {
      id: `h-${Date.now().toString(36)}`,
      person: form.person,
      from: { location: form.fromLocation, t: from.t },
      to,
      note: form.note || undefined,
    };
    sfxCardPlaced(sound);
    onCreate(fragment);
    setForm(emptyForm);
  };

  return (
    <ModalShell title="新建假设片段" onClose={onClose} ariaLabel="新建假设片段">
      <div className="clue-list">
        <p className="ev-layer-note">
          假设永远标为“假设”，只是你指定的“如果他在此时此地”。它不改变任何记录，也不会被系统当成事实。
          窗口为 {formatT(0)} 至 {formatT(DURATION_SECONDS)}。
        </p>
        <label className="clue-filters">
          人物
          <select
            value={form.person}
            onChange={(event) => setForm({ ...form, person: event.target.value as PersonId })}
          >
            <option value="">选择人物…</option>
            {PEOPLE.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="clue-filters">
          第一段地点
          <select
            value={form.fromLocation}
            onChange={(event) => setForm({ ...form, fromLocation: event.target.value as LocationId })}
          >
            <option value="">选择车厢…</option>
            {CARROAGES.map((carriage) => (
              <option key={carriage.id} value={carriage.id}>
                {carriage.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="clue-filters">
          第一段时刻（时:分:秒）
          <input
            className="mono"
            placeholder="23:59:30"
            value={form.fromTime}
            onChange={(event) => setForm({ ...form, fromTime: event.target.value })}
          />
        </label>
        <label className="clue-filters">
          第二段地点（可选，用于路线假设）
          <select
            value={form.toLocation}
            onChange={(event) => setForm({ ...form, toLocation: event.target.value as LocationId })}
          >
            <option value="">选择车厢…</option>
            {CARROAGES.map((carriage) => (
              <option key={carriage.id} value={carriage.id}>
                {carriage.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="clue-filters">
          第二段时刻（可选）
          <input
            className="mono"
            placeholder="00:00:00"
            value={form.toTime}
            onChange={(event) => setForm({ ...form, toTime: event.target.value })}
          />
        </label>
        <label className="clue-filters">
          备注
          <input
            placeholder="例如：如果他走的是另一条路线"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </label>
        {error && <p className="vd-warning">{error}</p>}
        <button type="button" className="btn btn-primary" onClick={submit}>
          创建并放到时间轴
        </button>
      </div>
    </ModalShell>
  );
};
