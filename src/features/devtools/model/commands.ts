// 개발 도구 명령·선택지·순간이동·네임드 위치 모델 — 순수 TypeScript (React 미참조).
// 서버 명령(debug 액션)의 화면 정의와 선택지를 기존 콘텐츠·규칙 표에서 파생한다(복제 금지).
import { DEBUG_ZONES } from '../../../game/rules/debug';
import type { DebugCommandId } from '../../../game/rules/debug';
import { minLevelOfPower } from '../../../game/rules/stats';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNTER_KEYS } from '../../../game/content/achievements';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { BOATS, boatGateText } from '../../../game/content/boats';
import { BOUNTY_PORT_ZONE, zoneOfPort } from '../../../game/content/bounties';
import { ENERGY_ITEM_IDS, RECIPES } from '../../../game/content/cooking';
import { FISH } from '../../../game/content/fish';
import { NAMED } from '../../../game/content/named';
import { BASE_REGION } from '../../../game/content/places';
import type { BaseId } from '../../../game/content/places';
import { RARITY } from '../../../game/content/rarity';
import { SPOTS } from '../../../game/content/spots';
import type { SpotId } from '../../../game/content/spots';
import { HATS } from '../../../game/content/wardrobe';
import { ZONE_IDS, topZoneOfSpot, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';

export type DevGroup = 'dex' | 'gear' | 'bounty' | 'account';

export interface DevOption { value: string; label: string }

export type DevParam =
  | { key: string; label: string; kind: 'int'; placeholder?: string; allowFloat?: boolean }
  | { key: string; label: string; kind: 'select'; options: () => DevOption[]; defaultValue?: string; required?: boolean }
  | { key: string; label: string; kind: 'bool'; defaultValue?: boolean };

export interface DevCommand {
  id: DebugCommandId;
  group: DevGroup;
  label: string;
  hint: string;
  params: DevParam[];
  minOneRequired?: boolean;
  /** 전용 UI(스냅샷 패널 등)가 대신 그리는 명령은 CommandForm 목록에서 숨긴다 */
  hiddenInForm?: boolean;
}

const BASE_LABELS: Record<BaseId, string> = {
  home: '집',
  harbor: '부산항',
  manila: '마닐라항',
  colombo: '콜롬보항',
  toamasina: '투아마시나항',
  walvisbay: '월비스베이항',
  lisbon: '리스본항',
};

export interface DevBaseTarget {
  id: BaseId;
  label: string;
  zone: ZoneId;
  zoneLabel: string;
  requiredBoat: number;
}

export interface DevSpotTarget {
  id: SpotId;
  label: string;
  zone: ZoneId;
  zoneLabel: string;
  requiredBoat: number;
  requiredRod: number;
}

export interface DevNamedLocation {
  id: string;
  name: string;
  zone: ZoneId;
  spot: SpotId | null;
  place: string;
}

/** 수배 구역 선택지 — 수배 구역을 구역 짧은 이름으로 */
export const devZoneOptions = (): DevOption[] =>
  DEBUG_ZONES.map(zone => ({ value: zone, label: zoneById(zone)?.shortName ?? zone }));

/** 전체(마을 포함) 구역 필터 선택지 */
export const devZoneFilterOptions = (): DevOption[] => [
  { value: 'all', label: '전체 구역' },
  ...ZONE_IDS.map(z => ({ value: z, label: zoneById(z)?.shortName ?? z })),
];

/** 도감 채우기/초기화용 구역 선택지 */
export const devAllZoneOptions = (): DevOption[] => [
  { value: 'all', label: '전체 구역 (120종)' },
  ...ZONE_IDS.map(z => ({ value: z, label: zoneById(z)?.shortName ?? z })),
];

/** 유물 선택지 — 유물 이름과 소속 구역 */
export const devArtifactOptions = (): DevOption[] =>
  ARTIFACTS.map(a => ({ value: a.id, label: `${a.name} (${zoneById(a.zone)?.shortName ?? a.zone})` }));

const devArtifactOrAllOptions = (): DevOption[] => [
  { value: 'all', label: '전체 유물 (8종)' },
  ...devArtifactOptions(),
];

const boatOptions = (): DevOption[] =>
  BOATS.map(b => ({ value: String(b.tier), label: `${b.tier} · ${b.name}` }));

const namedOptions = (): DevOption[] => [
  { value: 'all', label: '전체 네임드 (8종)' },
  ...NAMED.map(n => ({ value: n.id, label: `${n.name} (${zoneById(n.zones[0])?.shortName ?? n.zones[0]})` })),
];

const itemOptions = (): DevOption[] => [
  { value: ENERGY_ITEM_IDS.common, label: '기운 · 일반 생명의 기운' },
  { value: ENERGY_ITEM_IDS.rare, label: '기운 · 희귀 생명의 기운' },
  { value: ENERGY_ITEM_IDS.epic, label: '기운 · 영웅 생명의 기운' },
  { value: ENERGY_ITEM_IDS.legendary, label: '기운 · 전설 생명의 기운' },
  ...RECIPES.map(r => ({ value: r.id, label: `${r.kind === 'lunch' ? '도시락' : '미끼'} · ${r.name}` })),
  ...ARTIFACTS.map(a => ({ value: a.materialId, label: `재료 · ${a.materialName} (${a.name})` })),
];

const hatOptions = (): DevOption[] => [
  { value: 'all', label: `전체 모자 (${HATS.length}종)` },
  ...HATS.map(h => ({
    value: h.id,
    label: `${h.name} (${h.source === 'gold' ? '상점' : h.source === 'event' ? '이벤트' : '업적'})`,
  })),
];

const counterKeyOptions = (): DevOption[] => {
  const base: DevOption[] = [
    ...ACHIEVEMENT_COUNTER_KEYS.map(k => ({ value: k, label: `기본 · ${k}` })),
    { value: 'manual.total', label: '수동 · 전체 포획 (manual.total)' },
    { value: 'manual.legendary.total', label: '수동 · 전설 포획 (manual.legendary.total)' },
    { value: 'manual.variant.total', label: '수동 · 돌연변이 포획 (manual.variant.total)' },
  ];
  const zoneOpts: DevOption[] = ZONE_IDS.flatMap(z => {
    const label = zoneById(z)?.shortName ?? z;
    return [
      { value: `manual.total.${z}`, label: `수동 구역 · ${label} 전체 (manual.total.${z})` },
      { value: `manual.variant.${z}`, label: `수동 구역 · ${label} 변이 (manual.variant.${z})` },
    ];
  });
  const legOpts: DevOption[] = FISH.filter(f => f.rarity === 'legendary').map(f => ({
    value: `manual.legendary.${f.id}`,
    label: `수동 전설 · ${f.name} (manual.legendary.${f.id})`,
  }));
  return [...base, ...zoneOpts, ...legOpts];
};

const achievementOptions = (): DevOption[] => [
  { value: 'all', label: `전체 업적 (${ACHIEVEMENTS.length}종)` },
  ...ACHIEVEMENTS.map(a => ({ value: a.id, label: `${a.name} [${a.id}]` })),
];

const fishOptions = (): DevOption[] =>
  FISH.map(f => {
    const z = topZoneOfSpot(f.spot);
    const zLabel = z ? (zoneById(z)?.shortName ?? z) : f.spot;
    return { value: f.id, label: `${f.name} (${zLabel} · ${RARITY[f.rarity].name})` };
  });

/** 거점 7곳 메타 목록 */
export const devBaseTargets = (): DevBaseTarget[] =>
  (Object.keys(BASE_REGION) as BaseId[]).map(id => {
    const bZone = zoneOfPort(id);
    const zone: ZoneId = bZone ?? 'village';
    const requiredBoat = bZone ? (zoneById(bZone)?.entryBoat ?? 0) : 0;
    return {
      id,
      label: BASE_LABELS[id],
      zone,
      zoneLabel: zoneById(zone)?.shortName ?? zone,
      requiredBoat,
    };
  });

/** 해역 15곳 메타 목록 */
export const devSpotTargets = (): DevSpotTarget[] =>
  SPOTS.map(s => {
    const zone = topZoneOfSpot(s.id) ?? 'village';
    const entryBoat = zoneById(zone)?.entryBoat ?? 0;
    return {
      id: s.id,
      label: s.name,
      zone,
      zoneLabel: zoneById(zone)?.shortName ?? zone,
      requiredBoat: Math.max(s.boatTier, entryBoat),
      requiredRod: minLevelOfPower(s.powerReq ?? 0),
    };
  });

/** 네임드 8종 출현 해역 동적 안내 목록 */
export const devNamedLocations = (): DevNamedLocation[] =>
  NAMED.map(n => {
    const zone = n.zones[0];
    const zoneLabel = zoneById(zone)?.shortName ?? zone;
    const spotLabel = n.spot ? SPOTS.find(s => s.id === n.spot)?.name ?? n.spot : null;
    return {
      id: n.id,
      name: n.name,
      zone,
      spot: n.spot ?? null,
      place: spotLabel ? `${zoneLabel} · ${spotLabel} 전용` : `${zoneLabel} 전역`,
    };
  });

/** 항구가 속한 구역의 요구 배 문구 */
export const baseGateNote = (requiredBoat: number): string =>
  requiredBoat > 0 ? `${boatGateText(requiredBoat)} 필요` : '제한 없음';

const zoneParam: DevParam = { key: 'zone', label: '구역', kind: 'select', options: devZoneOptions, required: true };

export const DEV_COMMANDS: readonly DevCommand[] = [
  // ---- 장비·아이템·업적 ----
  {
    id: 'stats.set', group: 'gear', label: '스탯 설정', hint: '입력한 칸만 바꾼다(최소 1칸).', minOneRequired: true,
    params: [
      { key: 'gold', label: '골드', kind: 'int' },
      { key: 'fame', label: '명성', kind: 'int' },
      { key: 'rod', label: '낚싯대 Lv', kind: 'int' },
      { key: 'boat', label: '배', kind: 'select', options: boatOptions },
    ],
  },
  {
    id: 'items.grant', group: 'gear', label: '아이템 지급',
    hint: '기운은 화면 단위(1 = 개체 1마리분), 요리·재료는 개수 그대로 지급한다.',
    params: [
      { key: 'itemId', label: '아이템', kind: 'select', options: itemOptions, defaultValue: ENERGY_ITEM_IDS.common, required: true },
      { key: 'count', label: '수량', kind: 'int', placeholder: '1' },
    ],
  },
  {
    id: 'cooking.finish', group: 'gear', label: '진행 조리 즉시 완료',
    hint: '진행 중인 조리의 대기 시간을 끝내고 보관함으로 옮긴다.', params: [],
  },
  {
    id: 'artifact.set', group: 'gear', label: '유물·레벨 설정',
    hint: '레벨 0은 회수, 1~5는 보유 및 레벨 설정(전설은 Lv1 고정).',
    params: [
      { key: 'artifact', label: '유물', kind: 'select', options: devArtifactOrAllOptions, defaultValue: 'all', required: true },
      {
        key: 'level', label: '레벨', kind: 'select', defaultValue: '5', required: true,
        options: () => [
          { value: '0', label: '0 · 미보유(회수)' },
          { value: '1', label: 'Lv1' },
          { value: '2', label: 'Lv2' },
          { value: '3', label: 'Lv3' },
          { value: '4', label: 'Lv4' },
          { value: '5', label: 'Lv5' },
        ],
      },
    ],
  },
  {
    id: 'hat.set', group: 'gear', label: '모자 해금·회수',
    hint: `모자 ${HATS.length}종 또는 전체를 해금하거나 회수한다.`,
    params: [
      { key: 'hat', label: '모자', kind: 'select', options: hatOptions, defaultValue: 'all', required: true },
      {
        key: 'owned', label: '상태', kind: 'select', defaultValue: 'true', required: true,
        options: () => [
          { value: 'true', label: '해금(보유)' },
          { value: 'false', label: '회수(미보유)' },
        ],
      },
    ],
  },
  {
    id: 'bag.spawn', group: 'gear', label: '가방 개체 생성',
    hint: '고른 어종·폼·크기의 물고기를 가방에 넣는다.',
    params: [
      { key: 'fishId', label: '어종', kind: 'select', options: fishOptions, defaultValue: FISH[0]?.id, required: true },
      {
        key: 'form', label: '폼', kind: 'select', defaultValue: 'normal', required: true,
        options: () => [
          { value: 'normal', label: '일반' },
          { value: 'variant', label: '돌연변이' },
        ],
      },
      { key: 'size', label: '크기(cm)', kind: 'int', placeholder: '기본 평균', allowFloat: true },
      { key: 'count', label: '수량(1~50)', kind: 'int', placeholder: '1' },
      { key: 'big', label: '대어(월척) 크기 적용', kind: 'bool', defaultValue: false },
    ],
  },
  {
    id: 'achievement.setCounter', group: 'gear', label: '업적 카운터 설정',
    hint: 'achievement_counters 키에 절대값을 쓰고 업적을 재평가한다.',
    params: [
      { key: 'key', label: '카운터 키', kind: 'select', options: counterKeyOptions, defaultValue: 'sell.gold', required: true },
      { key: 'value', label: '값', kind: 'int', placeholder: '0' },
    ],
  },
  {
    id: 'achievement.resetCounters', group: 'gear', label: '업적 카운터 초기화',
    hint: '고른 키 또는 전체 카운터를 지운다.',
    params: [
      {
        key: 'key', label: '대상 키', kind: 'select', defaultValue: '',
        options: () => [{ value: '', label: '전체 카운터' }, ...counterKeyOptions()],
      },
      { key: 'resetAchievements', label: '업적 달성 상태도 초기화', kind: 'bool', defaultValue: false },
    ],
  },
  {
    id: 'achievement.evaluate', group: 'gear', label: '업적 재평가·상태 지정',
    hint: '업적을 현재 상태로 재평가하거나 수령 가능/완료/초기화 상태로 둔다.',
    params: [
      { key: 'id', label: '업적', kind: 'select', options: achievementOptions, defaultValue: 'all', required: true },
      {
        key: 'status', label: '동작', kind: 'select', defaultValue: 'recompute', required: true,
        options: () => [
          { value: 'recompute', label: '현재 상태 기준 재평가' },
          { value: 'claimable', label: '수령 가능(claimable)' },
          { value: 'claimed', label: '수령 완료(claimed)' },
          { value: 'reset', label: '초기화(미달성)' },
        ],
      },
    ],
  },

  // ---- 도감·네임드 ----
  {
    id: 'dex.fill', group: 'dex', label: '도감 채우기',
    hint: '마을 포함 구역 또는 전체 도감을 일반·돌연변이·대어·네임드 기준으로 채운다.',
    params: [
      { key: 'zone', label: '구역', kind: 'select', options: devAllZoneOptions, defaultValue: 'all', required: true },
      {
        key: 'form', label: '폼', kind: 'select', defaultValue: 'both', required: true,
        options: () => [
          { value: 'both', label: '일반 + 돌연변이' },
          { value: 'normal', label: '일반만' },
          { value: 'variant', label: '돌연변이만' },
        ],
      },
      { key: 'big', label: '대어(월척) 기준 크기 설정', kind: 'bool', defaultValue: false },
      { key: 'includeNamed', label: '네임드 도감·토벌 기록 포함', kind: 'bool', defaultValue: true },
    ],
  },
  {
    id: 'dex.reset', group: 'dex', label: '도감 초기화',
    hint: '지정 구역 또는 전체 도감 records 행을 지운다.',
    params: [
      { key: 'zone', label: '구역', kind: 'select', options: devAllZoneOptions, defaultValue: 'village', required: true },
      { key: 'includeNamed', label: '네임드 도감·토벌 기록 포함', kind: 'bool', defaultValue: false },
    ],
  },
  {
    id: 'dex.completeZone', group: 'dex', label: '수배 구역 도감 채우기(호환)',
    hint: '네임드 라이선스 도감 조건이 비었다고 보는 어종을 일반 1마리로 채운다.',
    params: [{ ...zoneParam, defaultValue: 'pacific' }],
    hiddenInForm: true,
  },
  {
    id: 'named.unlock', group: 'dex', label: '네임드 해금',
    hint: '도감 등록(records)과 토벌 기록(bounty_clears)을 함께 연다(기본값은 오늘 일일 한도를 소모하지 않는다).',
    params: [
      { key: 'namedId', label: '네임드', kind: 'select', options: namedOptions, defaultValue: 'all', required: true },
      { key: 'consumeDailyCap', label: '오늘 일일 한도 소모', kind: 'bool', defaultValue: false },
    ],
  },
  {
    id: 'named.reset', group: 'dex', label: '네임드 초기화',
    hint: '도감 등록(records)과 토벌 기록(bounty_clears)을 함께 지운다.',
    params: [
      { key: 'namedId', label: '네임드', kind: 'select', options: namedOptions, defaultValue: 'all', required: true },
    ],
  },

  // ---- 수배 ----
  {
    id: 'bounty.grantMaterial', group: 'bounty', label: '교환 재료 지급',
    hint: '고른 유물의 교환 재료를 고른 개수만큼 준다. 개수를 비우면 1개.',
    params: [
      { key: 'artifact', label: '유물', kind: 'select', options: devArtifactOptions, defaultValue: ARTIFACTS[0]?.id, required: true },
      { key: 'count', label: '개수', kind: 'int', placeholder: '1' },
    ],
  },
  {
    id: 'bounty.expireTickets', group: 'bounty', label: '도전권 즉시 만료',
    hint: '보유 도전권을 전날 게임 날짜로 옮겨 즉시 만료시킨다.', params: [],
  },
  { id: 'bounty.clearTickets', group: 'bounty', label: '흔적 지우기', hint: '도전권을 모두 지운다.', params: [] },
  {
    id: 'bounty.resetToday', group: 'bounty', label: '오늘 클리어 초기화',
    hint: '오늘 클리어 기록을 지워 일일 한도를 되돌린다.',
    params: [
      {
        key: 'kind', label: '대상', kind: 'select', defaultValue: 'all', required: true,
        options: () => [
          { value: 'all', label: '전체 (일반 + 네임드)' },
          { value: 'general', label: '일반 의뢰만' },
          { value: 'named', label: '네임드 토벌만' },
        ],
      },
    ],
  },
  { id: 'bounty.clearProgress', group: 'bounty', label: '진행 의뢰 정리', hint: '진행 중 의뢰를 모두 지운다.', params: [] },

  // ---- 계정·스냅샷 ----
  {
    id: 'snapshot.restore', group: 'account', label: '스냅샷 복원',
    hint: '저장된 스냅샷으로 게임 상태와 정규화 표를 복원한다.',
    params: [],
    hiddenInForm: true,
  },
];

export const BOUNTY_PORT_OPTIONS = BOUNTY_PORT_ZONE;

/** 명령 기본 입력값 생성 */
export function defaultRawArgs(command: DevCommand): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of command.params) {
    if (p.kind === 'select' && p.defaultValue !== undefined) out[p.key] = p.defaultValue;
    else if (p.kind === 'bool' && p.defaultValue !== undefined) out[p.key] = p.defaultValue ? 'true' : 'false';
  }
  return out;
}

/** 입력칸 문자열 → 명령 인자. 정수 칸은 내림, 빈 칸은 보내지 않는다. 필수·숫자가 아니면 거부 */
export function parseDevArgs(
  command: DevCommand, raw: Record<string, string>,
): { ok: true; args: Record<string, unknown> } | { ok: false } {
  const args: Record<string, unknown> = {};
  for (const param of command.params) {
    const text = (raw[param.key] ?? '').trim();
    if (param.kind === 'bool') {
      if (text === 'true') args[param.key] = true;
      else if (text === 'false') args[param.key] = false;
      continue;
    }
    if (text === '') {
      if (param.kind === 'select' && param.required) return { ok: false };
      continue;
    }
    if (param.kind === 'int') {
      const num = Number(text);
      if (!Number.isFinite(num)) return { ok: false };
      args[param.key] = param.allowFloat ? num : Math.floor(num);
    } else if (param.key === 'boat' || param.key === 'level') {
      const n = Math.floor(Number(text));
      if (!Number.isFinite(n)) return { ok: false };
      args[param.key] = n;
    } else if (param.key === 'owned') {
      if (text === 'true') args[param.key] = true;
      else if (text === 'false') args[param.key] = false;
      else return { ok: false };
    } else {
      args[param.key] = text;
    }
  }
  if (command.minOneRequired && Object.keys(args).length === 0) return { ok: false };
  return { ok: true, args };
}
