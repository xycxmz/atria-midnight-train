// 案件内容：失踪的星图盘（case-001）。
// 本文件包含完整剧透，是开发者与结案后回顾使用的固定案情，不在玩家默认界面展示。

import type { SpotClaim } from '../domain/constraints';
import type { TravelEdge } from '../domain/route';
import type { VerdictSpec } from '../domain/verdict';

export type LocationId = 'S' | 'D' | 'L';
export type PersonId = 'lin' | 'su' | 'zhou' | 'he';
export type EvidenceKind = 'record' | 'testimony' | 'physical';

export interface PersonTopic {
  id: string;
  question: string;
  answer: string;
  evidence?: string;
}

export interface Person {
  id: PersonId;
  name: string;
  initial: string;
  /** 玩家可见的中性身份；开发用的人物刻画不进入玩家视图 */
  role: string;
  shape: 'circle' | 'triangle' | 'square' | 'diamond';
  currentLocation: LocationId;
  topics: PersonTopic[];
}

export interface Hotspot {
  id: string;
  location: LocationId;
  label: string;
  hint: string;
  evidence: string[];
}

export interface EvidenceItem {
  id: string;
  title: string;
  /** 收得前在热点弹窗显示的中性标题（不剧透物件状态） */
  pendingTitle?: string;
  text: string;
  pendingMatchText?: string;
  kind: EvidenceKind;
  source: string;
  location: LocationId;
  hotspotId: string;
  recordedAt: number | null;
  claimPerson: PersonId | null;
  involves: PersonId[];
  claims?: Array<{ location: LocationId; t: number }>;
  objectNumber?: string;
}

export interface CarriageDef {
  id: LocationId;
  name: string;
  fullName: string;
  description: string;
}

export const CASE_ID = 'case-001';
export const CASE_VERSION = '1.0.0';
export const CASE_TITLE = '失踪的星图盘';
export const TIME_ORIGIN = { hours: 23, minutes: 56, seconds: 0 } as const;
export const DURATION_SECONDS = 360;
export const SNAP_STEP = 15;

export const EDGES: TravelEdge[] = [
  { from: 'S', to: 'D', seconds: 75 },
  { from: 'D', to: 'L', seconds: 75 },
];

export const CARROAGES: CarriageDef[] = [
  {
    id: 'S',
    name: 'S 车',
    fullName: 'S 会客车',
    description: '会客车。桌面上下各一只记录点，灯还亮着。',
  },
  {
    id: 'D',
    name: 'D 车',
    fullName: 'D 餐车',
    description: '餐车。服务台、交接板与外壁检修设备都在这一节。',
  },
  {
    id: 'L',
    name: 'L 车',
    fullName: 'L 行李车',
    description: '行李车。展匣和借用台位于车身中部。',
  },
];

export const PEOPLE: Person[] = [
  {
    id: 'lin',
    name: '林澈',
    initial: '林',
    role: '收藏人',
    shape: 'circle',
    currentLocation: 'S',
    topics: [
      {
        id: 'about-commission',
        question: '说说你委托运输的物件',
        answer: '“那枚黄铜星图盘是我从旧天文台收来的藏品。封存手续在 23:57:00 完成，当时我人在会客车，没有再靠近过行李车。”',
      },
    ],
  },
  {
    id: 'su',
    name: '苏砚',
    initial: '苏',
    role: '随车维修师',
    shape: 'triangle',
    currentLocation: 'D',
    topics: [
      {
        id: 'about-route',
        question: '昨晚你在哪几节车厢检修',
        answer: '“23:59:30 我还在行李车检查封条，零点整已经在餐车。”',
        evidence: 'E09',
      },
    ],
  },
  {
    id: 'zhou',
    name: '周岚',
    initial: '周',
    role: '餐车服务员',
    shape: 'square',
    currentLocation: 'D',
    topics: [
      {
        id: 'about-midnight',
        question: '零点前后谁来过服务台',
        answer: '“零点过十五秒，苏砚来到服务台问布巾。我记得很清楚，那一刻我正在连号服务单上掐点。”',
        evidence: 'E10',
      },
    ],
  },
  {
    id: 'he',
    name: '何川',
    initial: '何',
    role: '行李员',
    shape: 'diamond',
    currentLocation: 'L',
    topics: [
      {
        id: 'about-keys',
        question: 'K2 钥匙昨晚经手过谁',
        answer: '“K2 检修钥匙 23:57:00 借给苏砚，他负责封条和检修格。零点零分三十秒他在餐车还给了我，簿子上签了字。”',
      },
    ],
  },
];

export const HOTSPOTS: Hotspot[] = [
  { id: 'desk', location: 'S', label: '桌面', hint: '一只薄皮夹压在桌面下，里面是委托与签收单据。', evidence: ['E01', 'E04'] },
  { id: 's-entrance', location: 'S', label: '车门通行表', hint: '车门旁钉着车厢通行表。', evidence: ['E03'] },
  { id: 'wall-clock', location: 'D', label: '墙面', hint: '墙面上挂着列车校时表。', evidence: ['E02'] },
  { id: 'counter', location: 'D', label: '服务台', hint: '服务台上压着两份连号单据。', evidence: ['E05'] },
  { id: 'handover', location: 'D', label: '交接板', hint: '交接板上夹着今晚的货单。', evidence: ['E06'] },
  { id: 'nameplate', location: 'D', label: '检修铭牌', hint: '铭牌标注了检修格的位置与开合方式。', evidence: ['E11'] },
  { id: 'service-hatch', location: 'D', label: '外壁检修格', hint: '餐车外壁的检修格，盖板有被开启过的痕迹。', evidence: ['E12'] },
  { id: 'd-entrance', location: 'D', label: '车门通行表', hint: '车门旁钉着车厢通行表。', evidence: ['E03'] },
  { id: 'display-case', location: 'L', label: '展匣', hint: '展匣已经打开过，里面空着。', evidence: ['E07'] },
  { id: 'loan-desk', location: 'L', label: '借用台', hint: '借用台上摊着钥匙登记簿。', evidence: ['E08'] },
  { id: 'l-entrance', location: 'L', label: '车门通行表', hint: '车门旁钉着车厢通行表。', evidence: ['E03'] },
];

export const EVIDENCE: EvidenceItem[] = [
  {
    id: 'E01',
    title: '委托与封存单',
    text: '收藏人林澈委托运输黄铜星图盘一枚，编号 SM-2026-0907。23:57:00 由行李员何川在 L 车展匣完成封存；在册涉事人员共四名：林澈、苏砚、周岚、何川。00:02:00 开匣调查时，匣内已无该盘。',
    kind: 'record',
    source: 'S 会客车 · 桌面',
    location: 'S',
    hotspotId: 'desk',
    recordedAt: 60,
    claimPerson: null,
    involves: ['lin', 'he'],
  },
  {
    id: 'E02',
    title: '列车校时表',
    text: '展匣、打票器与交接印时共用同一校准计时基准，精确到秒；跨午夜时间一律记为次日 00 时起。本窗口为 23:56:00 至次日 00:02:00。',
    kind: 'record',
    source: 'D 餐车 · 墙面',
    location: 'D',
    hotspotId: 'wall-clock',
    recordedAt: null,
    claimPerson: null,
    involves: [],
  },
  {
    id: 'E03',
    title: '车厢通行表',
    text: 'S 会客车与 D 餐车相邻，D 餐车与 L 行李车相邻。相邻车厢单程至少 75 秒（含窄通道与门的通行），S 到 L 至少 150 秒。规则适用于所有人员，无外部路线。',
    kind: 'record',
    source: '车门 · 通行表',
    location: 'S',
    hotspotId: 's-entrance',
    recordedAt: null,
    claimPerson: null,
    involves: [],
  },
  {
    id: 'E04',
    title: '林澈的电报回执',
    text: '23:58:15，林澈在 S 会客车记录点签收电报回执，签收印时与列车校时表一致。',
    kind: 'record',
    source: 'S 会客车 · 桌面',
    location: 'S',
    hotspotId: 'desk',
    recordedAt: 135,
    claimPerson: 'lin',
    involves: ['lin'],
    claims: [{ location: 'S', t: 135 }],
  },
  {
    id: 'E05',
    title: '周岚的连号服务单',
    text: '两份连号服务单：23:58:15 与 23:58:45 均由周岚在 D 餐车服务台经手，印时连续，无离开记录。',
    kind: 'record',
    source: 'D 餐车 · 服务台',
    location: 'D',
    hotspotId: 'counter',
    recordedAt: 135,
    claimPerson: 'zhou',
    involves: ['zhou'],
    claims: [{ location: 'D', t: 135 }, { location: 'D', t: 165 }],
  },
  {
    id: 'E06',
    title: '何川的交接回执',
    text: '23:58:55，何川在 D 餐车交接板签署交接货单，印时与校时表一致。',
    kind: 'record',
    source: 'D 餐车 · 交接板',
    location: 'D',
    hotspotId: 'handover',
    recordedAt: 175,
    claimPerson: 'he',
    involves: ['he'],
    claims: [{ location: 'D', t: 175 }],
  },
  {
    id: 'E07',
    title: '展匣开启条',
    text: '封存完成（23:57:00）至调查开始（00:02:00）之间，展匣仅有一次开启记录：23:58:30，地点 L 行李车。开启动作与取走星图盘绑定，是本案唯一告知的封闭开启事件。',
    kind: 'record',
    source: 'L 行李车 · 展匣',
    location: 'L',
    hotspotId: 'display-case',
    recordedAt: 150,
    claimPerson: null,
    involves: [],
    // 事件锚点：开匣时刻与地点，供“人物记录 vs 已确定事件”对照（TR-010）
    claims: [{ location: 'L', t: 150 }],
  },
  {
    id: 'E08',
    title: '钥匙借用簿',
    text: 'K2 检修钥匙 23:57:00 在 L 行李车借给苏砚，00:00:30 于 D 餐车归还。K2 可开启展匣及餐车外壁检修格。',
    kind: 'record',
    source: 'L 行李车 · 借用台',
    location: 'L',
    hotspotId: 'loan-desk',
    recordedAt: 60,
    claimPerson: 'su',
    involves: ['su', 'he'],
    claims: [{ location: 'L', t: 60 }, { location: 'D', t: 270 }],
  },
  {
    id: 'E09',
    title: '苏砚的陈述',
    text: '苏砚： “23:59:30 我还在行李车检查封条，零点整已经在餐车。”',
    kind: 'testimony',
    source: '调查中询问苏砚',
    location: 'D',
    hotspotId: 'person-su',
    recordedAt: 210,
    claimPerson: 'su',
    involves: ['su'],
    claims: [{ location: 'L', t: 210 }, { location: 'D', t: 240 }],
  },
  {
    id: 'E10',
    title: '周岚的目击',
    text: '周岚： “零点过十五秒，苏砚来到服务台问布巾。”该时刻与其连号服务单掐点核对一致。',
    kind: 'testimony',
    source: '调查中询问周岚',
    location: 'D',
    hotspotId: 'person-zhou',
    recordedAt: 255,
    claimPerson: 'su',
    involves: ['su', 'zhou'],
    claims: [{ location: 'D', t: 255 }],
  },
  {
    id: 'E11',
    title: '检修格开合条',
    text: '00:00:12，餐车外壁检修格被 K2 钥匙打开过一次。铭牌注明检修格位于餐车外壁，仅能由 K2 开启。',
    kind: 'record',
    source: 'D 餐车 · 检修铭牌',
    location: 'D',
    hotspotId: 'nameplate',
    recordedAt: 252,
    claimPerson: null,
    involves: [],
    claims: [{ location: 'D', t: 252 }],
  },
  {
    id: 'E12',
    title: '找回的星图盘',
    pendingTitle: '壁板后的黄铜盘',
    text: '从餐车外壁检修格内取出的黄铜盘，盘面刻有编号 SM-2026-0907，与委托封存单记录一致。',
    pendingMatchText: '检修格里有一只黄铜盘，盘面刻着编号，但你还没有可以核对的委托记录。',
    kind: 'physical',
    source: 'D 餐车 · 外壁检修格',
    location: 'D',
    hotspotId: 'service-hatch',
    recordedAt: null,
    claimPerson: null,
    involves: [],
    objectNumber: 'SM-2026-0907',
  },
];

export const OBJECT_ID = '黄铜星图盘';

export const VERDICT_SPEC: VerdictSpec = {
  actor: 'su',
  eventT: 150,
  eventLocation: 'L',
  object: OBJECT_ID,
  stash: 'D-service-compartment',
  slots: [
    { id: 'object-time', label: '对象与时刻', requiredEvidence: ['E01', 'E02', 'E07'] },
    { id: 'person', label: '人物', requiredEvidence: ['E03', 'E04', 'E05', 'E06', 'E08'] },
    { id: 'testimony', label: '证词问题', requiredEvidence: ['E03', 'E09'] },
    { id: 'stash', label: '地点与找回', requiredEvidence: ['E01', 'E11', 'E12'] },
  ],
  optionalEvidence: ['E10'],
};

export const OBJECT_OPTIONS: Array<{ id: string; label: string }> = [
  { id: OBJECT_ID, label: '黄铜星图盘' },
  { id: 'silver-pocketwatch', label: '银质怀表' },
  { id: 'lacquer-box', label: '漆木首饰盒' },
];

export const STASH_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'D-service-compartment', label: '餐车外壁检修格' },
  { id: 'L-display-case', label: '行李车展匣夹层' },
  { id: 'S-desk', label: '会客车桌面暗格' },
  { id: 'D-crew-cabinet', label: '餐车乘务柜' },
];

export const PERSON_OPTIONS: Array<{ id: string; label: string }> = PEOPLE.map((person) => ({
  id: person.id,
  label: person.name,
}));

export const LOCATION_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'L', label: 'L 行李车' },
  { id: 'D', label: 'D 餐车' },
  { id: 'S', label: 'S 会客车' },
];

// 客观锚点（只在结案判定与历史对照中使用可靠记录，证词另存）
export const objectiveAnchorsFromCase = (): SpotClaim[] =>
  EVIDENCE.filter((item) => item.kind === 'record' && item.claims && item.claimPerson)
    .flatMap((item) =>
      (item.claims ?? []).map((claim) => ({
        person: item.claimPerson as string,
        location: claim.location,
        t: claim.t,
        evidence: item.id,
        kind: 'record' as const,
      })),
    );

export const testimonyClaimsFromCase = (): SpotClaim[] =>
  EVIDENCE.filter((item) => item.kind === 'testimony' && item.claims)
    .flatMap((item) =>
      (item.claims ?? []).map((claim) => ({
        person: item.claimPerson as string,
        location: claim.location,
        t: claim.t,
        evidence: item.id,
        kind: 'testimony' as const,
      })),
    );

export const BRIEFING =
  '午夜列车上，收藏人林澈托运的一枚黄铜星图盘从行李车展匣中失踪。列车即将抵达下一站，请在到站前查清是谁取走了它、何时取走、又藏去了哪里。';

export const TUTORIAL_STEPS: Array<{ id: string; text: string }> = [
  { id: 't1', text: '从左侧线索列表或地图上的热点开始调查。试试 S 会客车的“桌面”。' },
  { id: 't2', text: '得到卡片后，选中它，再选择一条人物轨道并确认放置——卡片会固定在它记录的时刻。' },
  { id: 't3', text: '把地图切到“历史对照”，再拖动下方时间游标：地图只显示你已经发现的记录，空白时段是“位置未知”。' },
];

export const HINT_LAYERS: string[] = [
  '第一层：先看车厢通行表——相邻车厢单程至少 75 秒，S 到 L 至少 150 秒。再想想 23:58:30 前后，每个人能在哪里。',
  '第二层：用事件前后的可靠位置记录夹逼。23:58:15 的电报回执、同一时刻与 23:58:45 的连号服务单、23:58:55 的交接回执，都是独立记录。',
  '第三层：直接算。把每个人某条记录到行李车 L 的最短用时，和该记录与 23:58:30 的时间差比较——差得最远的人，连一秒钟都挪不过去。',
];

export const ENDING_DIALOGUE =
  '苏砚沉默片刻，从工作服口袋里取出 K2 钥匙放在桌上。\n“是我拿的。23 点 58 分半，我用 K2 打开展匣，把星图盘带去了餐车，塞进外壁检修格。从行李车走到餐车整整 75 秒，我一步都没有多停。\n“我本来打算在下一站把它交给旧天文台的人。三十年前它从天文台散失，我认得盘上的编号，学检修那年在旧图纸里见过它。我不是要把它留在自己手里，也没有打算卖给谁。\n“我知道，这些都不能让我做的事变成对的。”他顿了顿，把钥匙推到桌沿，“剩下的，等列车到站再说吧。”';

export interface AuthorTimelineRow {
  clock: string;
  t: number;
  fact: string;
  /** 直接由证据支持（玩家可回查原文），还是由通行规则重建，或靠证据链推论 */
  proven: 'record' | 'inference' | 'reconstruction';
  provenBy?: string[];
}

export const AUTHOR_TIMELINE: AuthorTimelineRow[] = [
  { clock: '23:57:00', t: 60, fact: '何川在 L 完成封存，并把 K2 借给苏砚；苏砚随后留在 L。', proven: 'record', provenBy: ['E01', 'E08'] },
  { clock: '23:58:15', t: 135, fact: '林澈在 S 签收电报回执。', proven: 'record', provenBy: ['E04'] },
  { clock: '23:58:15', t: 135, fact: '周岚在 D 经手第一张连号服务单。', proven: 'record', provenBy: ['E05'] },
  { clock: '23:58:15', t: 135, fact: '何川此时已从 L 走到 D 并停留（由交接回执时间与通行规则推出，无直接位置记录）。', proven: 'inference', provenBy: ['E06', 'E03'] },
  { clock: '23:58:30', t: 150, fact: '展匣在 L 被打开一次——开启条只记录时刻与地点，不记录操作者。', proven: 'record', provenBy: ['E07'] },
  { clock: '23:58:30', t: 150, fact: '打开展匣取走星图盘的是苏砚（需要钥匙条件与排除结果共同支持）。', proven: 'inference', provenBy: ['E07', 'E08', 'E03', 'E04', 'E05', 'E06'] },
  { clock: '23:58:50', t: 170, fact: '苏砚离开 L，向 D 行走。', proven: 'reconstruction' },
  { clock: '23:58:55', t: 175, fact: '何川在 D 签署交接回执。', proven: 'record', provenBy: ['E06'] },
  { clock: '00:00:05', t: 245, fact: '苏砚到达 D，恰好用时 75 秒。', proven: 'reconstruction' },
  { clock: '00:00:12', t: 252, fact: 'D 外壁检修格被 K2 打开一次——开合条只记录时刻与地点。', proven: 'record', provenBy: ['E11'] },
  { clock: '00:00:12', t: 252, fact: '将星图盘放入检修格的是苏砚（身份由证据链推论）。', proven: 'inference', provenBy: ['E11', 'E08'] },
  { clock: '00:00:15', t: 255, fact: '周岚在 D 服务台见到苏砚。', proven: 'record', provenBy: ['E10'] },
  { clock: '00:00:30', t: 270, fact: '苏砚在 D 向何川归还 K2。', proven: 'record', provenBy: ['E08'] },
  { clock: '00:01:45', t: 345, fact: '何川从 D 返回 L。', proven: 'reconstruction' },
  { clock: '00:02:00', t: 360, fact: '调查开始，事件历史不再前进。', proven: 'record', provenBy: ['E01'] },
];


export const EXCLUSION_TABLE = `四名候选人各自到事件地点 L 的核对（事件固定在 23:58:30）：
林澈：S 的 23:58:15，可用 15 秒，需要 150 秒——不可能。
周岚：D 的 23:58:15 与 23:58:45，可用 15 秒，需要 75 秒——不可能。
何川：D 的 23:58:55，可用 25 秒，需要 75 秒——不可能。
苏砚：L 的 23:57:00 与 D 的 00:00:30 均不被排除。`;
