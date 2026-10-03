import { useEffect, useRef, useState } from 'react';
import { PEOPLE, SNAP_STEP } from '../content/case-001';
import type { LocationId, PersonId } from '../content/case-001';
import { DURATION_SECONDS, formatT, parseT, snapT } from '../content/time-origin';
import type { Placement } from '../state/investigation';

export interface ClaimTick {
  location: LocationId;
  t: number;
  kind: 'record' | 'testimony' | 'hypothesis';
}

export interface TimelineCard {
  key: string;
  refId: string;
  cardKind: Placement['cardKind'];
  lane: PersonId;
  t: number;
  title: string;
  ticks: ClaimTick[];
}

export interface PlaceIntent {
  cardKind: Placement['cardKind'];
  refId: string;
  lane: PersonId;
}

interface TimelineProps {
  cards: TimelineCard[];
  cursorT: number;
  selection: string[];
  placementPending: { cardKind: Placement['cardKind']; refId: string; title: string } | null;
  onCursor: (t: number) => void;
  onCursorStep: (delta: number) => void;
  onPlace: (intent: PlaceIntent) => void;
  onRemovePlacement: (id: string) => void;
  onCancelPlacement: () => void;
  onToggleCardSelection: (id: string) => void;
  onOpenCardDetail: (refId: string) => void;
  onCreateHypothesis: () => void;
}

const LANE_LEFT = 74;
const LANE_RIGHT_PAD = 12;

const TICK_STEP = 15;
const MAJOR_STEP = 60;

export const Timeline = ({
  cards,
  cursorT,
  selection,
  placementPending,
  onCursor,
  onCursorStep,
  onPlace,
  onRemovePlacement,
  onCancelPlacement,
  onToggleCardSelection,
  onOpenCardDetail,
  onCreateHypothesis,
}: TimelineProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragOverLane, setDragOverLane] = useState<PersonId | null>(null);
  const [timeInput, setTimeInput] = useState('');
  const [timeInputError, setTimeInputError] = useState('');

  // 游标与刻度共用同一坐标：以 .tl-inner 为原点，正确处理横向滚动与内边距
  const tFromClientX = (clientX: number): number => {
    const region = trackRef.current;
    if (!region) return cursorT;
    const rect = region.getBoundingClientRect();
    const usable = rect.width - LANE_LEFT - LANE_RIGHT_PAD;
    const ratio = (clientX - rect.left - LANE_LEFT) / usable;
    return snapT(Math.round(ratio * DURATION_SECONDS));
  };

  const locateInput = () => {
    const parsed = parseT(timeInput);
    if (!parsed.ok) {
      setTimeInputError(parsed.message);
      return;
    }
    setTimeInputError('');
    onCursor(parsed.t);
  };

  const handleCursorPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => onCursor(tFromClientX(moveEvent.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleCursorKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        onCursorStep(-SNAP_STEP);
        break;
      case 'ArrowRight':
        event.preventDefault();
        onCursorStep(SNAP_STEP);
        break;
      case 'Home':
        event.preventDefault();
        onCursor(0);
        break;
      case 'End':
        event.preventDefault();
        onCursor(DURATION_SECONDS);
        break;
      default:
        break;
    }
  };

  const handleRulerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    onCursor(tFromClientX(event.clientX));
  };

  const handleCardDragStart = (event: React.DragEvent<HTMLDivElement>, card: TimelineCard) => {
    event.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ cardKind: card.cardKind, refId: card.refId, from: 'timeline' }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleLaneDragOver = (event: React.DragEvent<HTMLDivElement>, lane: PersonId) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverLane !== lane) setDragOverLane(lane);
  };

  const handleLaneDrop = (event: React.DragEvent<HTMLDivElement>, lane: PersonId) => {
    event.preventDefault();
    setDragOverLane(null);
    const raw = event.dataTransfer.getData('text/plain');
    if (!raw) return;
    const payload = JSON.parse(raw) as { cardKind: Placement['cardKind']; refId: string };
    onPlace({ cardKind: payload.cardKind, refId: payload.refId, lane });
  };

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && placementPending) onCancelPlacement();
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [placementPending, onCancelPlacement]);

  const allTicks = Array.from(
    { length: DURATION_SECONDS / TICK_STEP + 1 },
    (_, index) => index * TICK_STEP,
  );

  const laneLeftOf = (t: number): string =>
    `calc(${LANE_LEFT}px + (100% - ${LANE_LEFT + LANE_RIGHT_PAD}px) * ${t / DURATION_SECONDS})`;

  return (
    <section className="center-timeline" aria-label="人物时间轨道">
      <div className="tl-toolbar">
        <h2 className="panel-heading" style={{ border: 0, padding: 0 }}>
          时间轴
        </h2>
        <span className="tl-clock" aria-label="当前游标时间">
          {formatT(cursorT)}
        </span>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => onCursorStep(-SNAP_STEP)}
          aria-label="游标后退 15 秒"
        >
          −15 秒
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => onCursorStep(SNAP_STEP)}
          aria-label="游标前进 15 秒"
        >
          +15 秒
        </button>
        <button type="button" className="btn btn-small" onClick={onCreateHypothesis}>
          新建假设片段
        </button>
        <label className="tl-jump">
          定位时刻
          <input
            className="mono"
            placeholder="00:00:12"
            value={timeInput}
            onChange={(event) => setTimeInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                locateInput();
              }
            }}
            aria-invalid={timeInputError !== ''}
          />
          <button type="button" className="btn btn-small" onClick={locateInput}>
            定位
          </button>
        </label>
        {timeInputError && <span className="save-state" role="alert">{timeInputError}</span>}
        {placementPending && (
          <>
            <span className="save-state">
              请选择一条轨道放置“{placementPending.title}”（窗口 {formatT(0)} 至 {formatT(DURATION_SECONDS)}）
            </span>
            <button type="button" className="btn btn-small" onClick={onCancelPlacement}>
              取消放置（Esc）
            </button>
          </>
        )}
      </div>
      <div className="tl-body">
        <div className="tl-inner">
          <div className="tl-track" ref={trackRef}>
            <div className="tl-ruler" onPointerDown={handleRulerPointerDown}>
              {allTicks.map((tick) => (
                <span
                  key={tick}
                  className={`tl-tick ${tick % MAJOR_STEP === 0 ? 'major' : 'minor'}`}
                  style={{ left: laneLeftOf(tick) }}
                >
                  {tick % MAJOR_STEP === 0 ? formatT(tick) : ''}
                </span>
              ))}
            </div>
            {PEOPLE.map((person) => {
              const laneCards = cards.filter((card) => card.lane === person.id);
              return (
                <div
                  key={person.id}
                  className={`tl-lane ${dragOverLane === person.id ? 'drag-target' : ''}`}
                  onDragOver={(event) => handleLaneDragOver(event, person.id)}
                  onDragLeave={() => dragOverLane === person.id && setDragOverLane(null)}
                  onDrop={(event) => handleLaneDrop(event, person.id)}
                >
                  <span className="tl-lane-label">{person.name}</span>
                  {laneCards.flatMap((card) =>
                    card.ticks.map((tick) => (
                      <button
                        type="button"
                        key={`${card.key}-tick-${tick.t}`}
                        className={`tl-claim kind-${tick.kind}`}
                        style={{ left: laneLeftOf(tick.t) }}
                        title={`定位到 ${card.title} · ${tick.location} 车 · ${formatT(tick.t)}`}
                        aria-label={`定位到 ${formatT(tick.t)}：${card.title}（${tick.location} 车）`}
                        onClick={() => onCursor(tick.t)}
                      >
                        ◆
                      </button>
                    )),
                  )}
                  {laneCards.map((card) => (
                    <div
                      key={card.key}
                      className={`tl-card kind-${card.cardKind} ${selection.includes(card.refId) ? 'selected' : ''}`}
                      style={{ left: laneLeftOf(card.t) }}
                      draggable
                      onDragStart={(event) => handleCardDragStart(event, card)}
                      onClick={() => onToggleCardSelection(card.refId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onToggleCardSelection(card.refId);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      title={`${card.title} ${formatT(card.t)}（点击加入/移出对照）`}
                      aria-pressed={selection.includes(card.refId)}
                    >
                      <span className="mono">{formatT(card.t)}</span>
                      <span>{card.title}</span>
                      <span className="tl-card-actions">
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenCardDetail(card.refId);
                          }}
                        >
                          详情
                        </button>
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemovePlacement(card.key);
                          }}
                        >
                          移出
                        </button>
                      </span>
                    </div>
                  ))}
                  {placementPending && (
                    <button
                      type="button"
                      className="tl-drop-confirm"
                      onClick={() =>
                        onPlace({
                          cardKind: placementPending.cardKind,
                          refId: placementPending.refId,
                          lane: person.id,
                        })
                      }
                    >
                      将“{placementPending.title}”放到 {person.name} 轨道
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="tl-cursor" style={{ left: laneLeftOf(cursorT) }}>
            <button
              type="button"
              className="tl-cursor-handle"
              onPointerDown={handleCursorPointerDown}
              onKeyDown={handleCursorKey}
              aria-label="时间游标，左右方向键调整"
              aria-valuenow={cursorT}
              aria-valuemin={0}
              aria-valuemax={DURATION_SECONDS}
              aria-valuetext={formatT(cursorT)}
            />
          </div>
          {cards.length === 0 && !placementPending && (
            <span className="save-state">
              打开证据卡选“放入时间轴”，或把卡片拖到轨道上；证据时间固定不可拖改，假设片段可自定时间。
            </span>
          )}
        </div>
      </div>
    </section>
  );
};
