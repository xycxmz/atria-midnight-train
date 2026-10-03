import { useState } from 'react';
import { CARROAGES, HOTSPOTS, PEOPLE } from '../content/case-001';
import type { Hotspot, LocationId, Person, PersonId } from '../content/case-001';
import { formatT } from '../content/time-origin';
import type { MapMode } from '../state/investigation';
import type { PersonPositionView } from '../state/investigation';

interface TrainMapProps {
  mapMode: MapMode;
  cursorT: number;
  investigatedHotspotIds: Set<string>;
  pendingHotspotIds: Set<string>;
  hotspotOpen: string | null;
  historyPositions: PersonPositionView[];
  onHotspotClick: (hotspot: Hotspot) => void;
  onSetMapMode: (mode: MapMode) => void;
  onOpenUninvestigated: () => void;
}

// 1000 × 420 视图坐标系下的固定布局：三节车厢横向展开，门在车厢之间。
const CARRIAGE_RECT: Record<LocationId, { x: number; y: number; w: number; h: number }> = {
  S: { x: 40, y: 110, w: 275, h: 185 },
  D: { x: 365, y: 110, w: 275, h: 185 },
  L: { x: 690, y: 110, w: 275, h: 185 },
};

const HOTSPOT_POS: Record<string, { x: number; y: number }> = {
  desk: { x: 112, y: 200 },
  's-entrance': { x: 290, y: 250 },
  'wall-clock': { x: 400, y: 158 },
  counter: { x: 465, y: 210 },
  handover: { x: 580, y: 210 },
  nameplate: { x: 430, y: 338 },
  'service-hatch': { x: 545, y: 338 },
  'd-entrance': { x: 370, y: 262 },
  'display-case': { x: 775, y: 210 },
  'loan-desk': { x: 885, y: 250 },
  'l-entrance': { x: 700, y: 262 },
};

// 调查视图人物位置：避开热点按钮，避免遮挡点击目标
const INVESTIGATE_POS: Record<PersonId, { x: number; y: number }> = {
  lin: { x: 150, y: 285 },
  zhou: { x: 430, y: 290 },
  su: { x: 560, y: 290 },
  he: { x: 815, y: 285 },
};

// 历史对照时每个人物在各车厢的落点槽位（四人×三车厢，完整通用，不按作者真实路线裁剪）。
const HISTORY_POS: Record<PersonId, Record<LocationId, { x: number; y: number }>> = {
  lin: { S: { x: 150, y: 285 }, D: { x: 430, y: 290 }, L: { x: 735, y: 285 } },
  zhou: { S: { x: 175, y: 220 }, D: { x: 460, y: 262 }, L: { x: 775, y: 272 } },
  su: { S: { x: 185, y: 272 }, D: { x: 545, y: 275 }, L: { x: 815, y: 210 } },
  he: { S: { x: 195, y: 230 }, D: { x: 610, y: 250 }, L: { x: 880, y: 250 } },
};

const personOf = (id: PersonId): Person => PEOPLE.find((person) => person.id === id) as Person;

const pct = (value: number, basis: number): string => `${(value / basis) * 100}%`;

const PersonShape = ({
  shape,
  initial,
  tone,
}: {
  shape: Person['shape'];
  initial: string;
  tone: 'ink' | 'testimony' | 'hypothesis';
}) => {
  const stroke = tone === 'testimony' ? 'var(--testimony)' : tone === 'hypothesis' ? 'var(--hypothesis)' : 'var(--ink)';
  const shapeMarkup = {
    circle: <circle r="15" />,
    triangle: <polygon points="0,-16 15,12 -15,12" />,
    square: <rect x="-13" y="-13" width="26" height="26" />,
    diamond: <polygon points="0,-17 16,0 0,17 -16,0" />,
  }[shape];
  return (
    <svg width="36" height="36" viewBox="-20 -20 40 40" aria-hidden="true">
      <g
        fill="var(--paper-card)"
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray={tone === 'ink' ? undefined : '4 3'}
      >
        {shapeMarkup}
      </g>
      <text textAnchor="middle" dominantBaseline="central" fontSize="13" fill="var(--ink)">
        {initial}
      </text>
    </svg>
  );
};

const PersonMarker = ({
  personId,
  x,
  y,
  tone,
  lines,
}: {
  personId: PersonId;
  x: number;
  y: number;
  tone: 'ink' | 'testimony' | 'hypothesis';
  lines: string[];
}) => {
  const person = personOf(personId);
  return (
    <div
      className="person-marker"
      style={{ left: pct(x, 1000), top: pct(y, 420) }}
      title={`${person.name} · ${person.role}`}
    >
      <PersonShape shape={person.shape} initial={person.initial} tone={tone} />
      <span className="person-label">{person.name}</span>
      {lines.map((line) => (
        <span key={line} className="person-label">
          {line}
        </span>
      ))}
    </div>
  );
};

export const TrainMap = ({
  mapMode,
  cursorT,
  investigatedHotspotIds,
  pendingHotspotIds,
  hotspotOpen,
  historyPositions,
  onHotspotClick,
  onSetMapMode,
  onOpenUninvestigated,
}: TrainMapProps) => {
  const showHotspots = mapMode === 'investigate';
  const [carriageFocus, setCarriageFocus] = useState<LocationId>('S');

  // 窄屏：选车厢 + 该车厢的物件列表，与地图走同一个调查动作（onHotspotClick）
  const focusHotspots = HOTSPOTS.filter((hotspot) => hotspot.location === carriageFocus);
  const focusPersons = PEOPLE.filter((person) => person.currentLocation === carriageFocus);

  return (
    <section className="center-map" aria-label="列车平面图">
      <div className="map-focus" aria-label="车厢聚焦列表">
        <div className="map-carriages" role="tablist" aria-label="选择车厢">
          {CARROAGES.map((carriage) => (
            <button
              key={carriage.id}
              type="button"
              role="tab"
              aria-selected={carriageFocus === carriage.id}
              className={`btn btn-small ${carriageFocus === carriage.id ? 'btn-primary' : ''}`}
              onClick={() => setCarriageFocus(carriage.id)}
            >
              {carriage.fullName}
            </button>
          ))}
        </div>
        <ul className="focus-list">
          {focusHotspots.map((hotspot) => {
            const done = investigatedHotspotIds.has(hotspot.id);
            return (
              <li key={hotspot.id}>
                <button
                  type="button"
                  className={`focus-item ${done ? 'done' : ''} ${hotspotOpen === hotspot.id ? 'open' : ''}`}
                  onClick={() => onHotspotClick(hotspot)}
                >
                  <span className="focus-label">{hotspot.label}</span>
                  <span className="focus-state">{done ? '已查看' : '调查'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="focus-people">
          本车厢人员：{focusPersons.map((person) => person.name).join('、') || '无'}（询问请打开“询问”页签）
        </p>
      </div>
      <div className="map-toolbar">
        <div className="mode-switch" role="group" aria-label="地图状态">
          <button
            type="button"
            aria-pressed={mapMode === 'investigate'}
            onClick={() => onSetMapMode('investigate')}
          >
            调查视图
          </button>
          <button
            type="button"
            aria-pressed={mapMode === 'history'}
            onClick={() => onSetMapMode('history')}
          >
            历史对照
          </button>
        </div>
        <button type="button" className="btn btn-small" onClick={onOpenUninvestigated}>
          未调查地点
        </button>
        {mapMode === 'history' && (
          <span className="save-state">
            游标：<span className="mono">{formatT(cursorT)}</span>（只显示已发现的记录）
          </span>
        )}
      </div>
      <div className="map-canvas">
        <div className="map-stage">
        <svg className="map-svg" viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label="S 会客车、D 餐车、L 行李车三节车厢平面图">
          {/* 轨道 */}
          <line x1="20" y1="330" x2="985" y2="330" stroke="var(--structure-strong)" strokeWidth="4" />
          <line x1="20" y1="342" x2="985" y2="342" stroke="var(--structure-strong)" strokeWidth="4" />
          {[60, 190, 320, 450, 580, 710, 840, 970].map((x) => (
            <line key={x} x1={x} y1="328" x2={x + 30} y2="346" stroke="var(--structure)" strokeWidth="3" />
          ))}
          {CARROAGES.map((carriage) => {
            const rect = CARRIAGE_RECT[carriage.id];
            return (
              <g key={carriage.id}>
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.w}
                  height={rect.h}
                  rx="10"
                  fill="var(--paper-card)"
                  stroke="var(--ink)"
                  strokeWidth="2"
                />
                <line
                  x1={rect.x + 12}
                  y1={rect.y + 26}
                  x2={rect.x + rect.w - 12}
                  y2={rect.y + 26}
                  stroke="var(--structure)"
                  strokeWidth="2"
                />
                <text x={rect.x + 14} y={rect.y + 20} fontSize="15" fill="var(--ink-soft)">
                  {carriage.fullName}
                </text>
                <line
                  x1={rect.x + 8}
                  y1={rect.y + rect.h - 8}
                  x2={rect.x + rect.w - 8}
                  y2={rect.y + rect.h - 8}
                  stroke="var(--structure)"
                  strokeWidth="2"
                />
              </g>
            );
          })}
          {/* 车厢之间的门与窄通道 */}
          {[{ x: 315 }, { x: 640 }].map((door) => (
            <g key={door.x}>
              <rect x={door.x} y="190" width="50" height="105" fill="var(--paper-deep)" stroke="var(--structure-strong)" strokeWidth="2" rx="4" />
              <text x={door.x + 25} y="250" fontSize="12" textAnchor="middle" fill="var(--ink-faint)">
                门
              </text>
            </g>
          ))}
        </svg>

        {showHotspots &&
          HOTSPOTS.map((hotspot) => {
            const pos = HOTSPOT_POS[hotspot.id];
            const done = investigatedHotspotIds.has(hotspot.id);
            const pending = pendingHotspotIds.has(hotspot.id);
            return (
              <button
                key={hotspot.id}
                type="button"
                className={`hotspot-btn ${done ? 'done' : ''} ${hotspotOpen === hotspot.id ? 'open' : ''}`}
                style={{ left: pct(pos.x, 1000), top: pct(pos.y, 420) }}
                title={`${hotspot.label}：${hotspot.hint}`}
                onClick={() => onHotspotClick(hotspot)}
                aria-label={`调查 ${CARROAGES.find((c) => c.id === hotspot.location)?.fullName} 的${hotspot.label}`}
              >
                <span className="hotspot-dot" aria-hidden="true" />
                {hotspot.label}
                {pending && <span aria-hidden="true">·新</span>}
              </button>
            );
          })}

        {mapMode === 'investigate' &&
          PEOPLE.map((person) => {
            const pos = INVESTIGATE_POS[person.id];
            return (
              <PersonMarker
                key={person.id}
                personId={person.id}
                x={pos.x}
                y={pos.y}
                tone="ink"
                lines={[`现于 ${person.currentLocation} 车`]}
              />
            );
          })}

        {mapMode === 'history' &&
          (() => {
            const unknownPersons = historyPositions
              .filter((position) => position.status === 'unknown')
              .map((position) => position.person);
            return (
              <>
                {historyPositions.map((position) => {
            const slots = HISTORY_POS[position.person];
            const slotFor = (location?: LocationId): { x: number; y: number } =>
              slots[location ?? 'S'];
            if (position.status === 'known' && position.location) {
              const pos = slotFor(position.location);
              if (!pos) return null;
              const tone =
                position.fromClaim?.kind === 'testimony'
                  ? 'testimony'
                  : position.fromClaim?.kind === 'hypothesis'
                    ? 'hypothesis'
                    : 'ink';
              return (
                <PersonMarker
                  key={position.person}
                  personId={position.person}
                  x={pos.x}
                  y={pos.y}
                  tone={tone}
                  lines={[
                    `${formatT(position.fromClaim?.t ?? cursorT)}`,
                    `${position.fromClaim?.kind === 'testimony' ? '证词' : position.fromClaim?.kind === 'hypothesis' ? '假设' : '记录'} · ${position.location} 车`,
                  ]}
                />
              );
            }
            if (position.status === 'simulated' && position.location) {
              const pos = slotFor(position.location);
              if (!pos) return null;
              return (
                <PersonMarker
                  key={position.person}
                  personId={position.person}
                  x={pos.x}
                  y={pos.y}
                  tone="hypothesis"
                  lines={[`${formatT(cursorT)} 假设路径`]}
                />
              );
            }
            return null;
          })}
          {unknownPersons.length > 0 && (
            <div className="unknown-strip" role="list" aria-label="位置未知的人物">
              <span>
                该时刻位置未知：中间没有记录的时段一律显示“未知”，不做最短路径插值。
              </span>
              {unknownPersons.map((personId) => (
                <span key={personId} className="unknown-chip" role="listitem">
                  ? {personOf(personId).name}
                </span>
              ))}
            </div>
          )}
          </>
            );
          })()}
        </div>
      </div>
    </section>
  );
};
