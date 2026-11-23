// 업적 창의 파생 모델 — 판정(진척, 수령 가능, 누적 보너스)은 게임 규칙의 순수 함수를 그대로 쓰고,
// 여기서는 화면이 읽을 값(요약 줄, 3탭 목록, 다단계 압축 카드, 행 상태)으로 묶는다.
import {
  ACHIEVEMENTS,
  CUMULATIVE_BONUS_SERIES,
  achievementForHatId,
  namedSpoilerPlace,
} from '../../../game/content/achievements';
import type {
  AchievementDef,
  AchievementTab,
  CosmeticKind,
  CumulativeBonusKind,
  CumulativeBonusSeries,
} from '../../../game/content/achievements';
import { namedById } from '../../../game/content/named';
import { hatById } from '../../../game/content/wardrobe';
import type { ZoneId } from '../../../game/content/zones';
import { zoneById } from '../../../game/content/zones';
import {
  achievementProgress,
  cumulativeBonusProgress,
} from '../../../game/rules/achievements';
import type { GameState } from '../../../game/rules/logic';
import { canClaimAchievement, canClaimAllAchievements } from '../../../game/rules/rules';

/** 업적 창 3탭 — 진행, 누적 보너스, 치장 */
export const ACHIEVEMENT_TABS: { key: AchievementTab; label: string }[] = [
  { key: 'progress', label: '진행' },
  { key: 'bonus', label: '누적 보너스' },
  { key: 'cosmetic', label: '치장' },
];

export type CosmeticFilter = 'all' | CosmeticKind;

export const COSMETIC_FILTERS: readonly { key: CosmeticFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'named', label: '네임드' },
  { key: 'night', label: '밤 도감' },
  { key: 'variant', label: '돌연변이' },
  { key: 'big', label: '월척' },
  { key: 'general', label: '기타' },
];

export type AchievementRowStatus = 'progress' | 'claimable' | 'claimed';

export interface AchievementRow {
  def: AchievementDef;
  /** 진행 중: 조건을 채우지 못했다. claimable: 받을 수 있다. claimed: 받았다 */
  status: AchievementRowStatus;
  /** 진척 — 현재 / 목표. 진척은 숫자로만 보인다(미발견 실명을 드러내지 않는다) */
  progress: { current: number; target: number };
}

/** 다단계 누적 보너스 카드 모델 */
export interface CumulativeBonusStepView {
  id: string;
  label: string;
  deltaText: string;
  state: 'done' | 'now' | 'todo';
}

export type CumulativeBonusIcon =
  | 'rod' | 'star' | 'sparkle' | 'clock' | 'target' | 'bait' | 'crown' | 'coin' | 'gem';

export interface CumulativeBonusCardModel {
  series: CumulativeBonusSeries;
  icon: CumulativeBonusIcon;
  scopeLabel: string;
  current: number;
  nextThreshold: number;
  nextDeltaText: string | null;
  allDone: boolean;
  activeText: string;
  maxText: string;
  steps: CumulativeBonusStepView[];
}

/** 치장 탭 다단계 네임드 토벌 카드 모델 */
export interface NamedGroupStepView {
  id: string;
  threshold: number;
  hatId: string;
  hatName: string;
  status: AchievementRowStatus;
  label: string;
}

export interface NamedGroupCardModel {
  kind: 'namedGroup';
  groupId: string;
  namedId: string;
  discovered: boolean;
  title: string;
  desc: string;
  scopeLabel: string;
  current: number;
  target: number;
  status: AchievementRowStatus;
  /** 받을 수 있는 단계가 있으면 그 단계, 없으면 다음 미달성 단계(모두 받음이면 마지막 단계) */
  activeRow: AchievementRow;
  steps: NamedGroupStepView[];
}

export type CosmeticCardItem =
  | { kind: 'single'; row: AchievementRow; scopeLabel: string }
  | NamedGroupCardModel;

const fmtPct = (v: number, sign: '+' | '−'): string => {
  const pct = Math.round(v * 1000) / 10;
  return `${sign}${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
};

const bonusSignOf = (kind: CumulativeBonusKind): '+' | '−' =>
  kind === 'biteWaitCut' ? '−' : '+';

const bonusEffectLabelOf = (series: CumulativeBonusSeries): string => {
  const zoneName = series.zone ? (zoneById(series.zone)?.shortName ?? series.zone) : '';
  switch (series.bonusKind) {
    case 'biteWaitCut': return '입질 대기';
    case 'mutationWeight': return '돌연변이 가중치';
    case 'rareWeight': return '희귀 이상 가중치';
    case 'epicWeight': return '영웅 이상 가중치';
    case 'legendaryWeight': return '전설 가중치';
    case 'sellBonus': return '판매가 보너스';
    case 'namedWeight': return '네임드 조우 가중치';
    case 'moveSpeed': return '이동 속도';
    case 'artifactBoost': return '보유 유물 효과';
    case 'zoneLegendary': return `${zoneName} 전설 가중치`;
    case 'zoneMutation': return `${zoneName} 돌연변이 가중치`;
  }
};

const bonusIconOf = (series: CumulativeBonusSeries): CumulativeBonusIcon => {
  switch (series.id) {
    case 'bonus-manual-total': return 'rod';
    case 'bonus-manual-legendary': return 'star';
    case 'bonus-manual-variant': return 'sparkle';
    case 'bonus-catch-auto': return 'clock';
    case 'bonus-catch-perfect': return 'target';
    case 'bonus-catch-bait': return 'bait';
    case 'bonus-named-flawless': return 'crown';
    case 'bonus-sell-gold': return 'coin';
    case 'bonus-max-artifact': return 'gem';
    default: return series.bonusKind === 'zoneLegendary' ? 'star' : 'sparkle';
  }
};

/** 행 상태 — claimed이면 받음, claimable이면 받을 수 있음, 그 밖은 진행 중 */
export function rowStatusOf(game: GameState, id: string): AchievementRowStatus {
  const stored = game.achievements[id];
  if (stored === 'claimed') return 'claimed';
  if (stored === 'claimable') return 'claimable';
  return 'progress';
}

/** 한 업적의 행 값. 진척은 규칙의 순수 판정에서 온다 */
export function achievementRow(game: GameState, def: AchievementDef): AchievementRow {
  const p = achievementProgress(game, def.id);
  return { def, status: rowStatusOf(game, def.id), progress: { current: p.current, target: p.target } };
}

/** id로 행을 만든다. 모르는 id면 undefined다 */
export function achievementRowById(game: GameState, id: string): AchievementRow | undefined {
  const def = ACHIEVEMENTS.find(a => a.id === id);
  return def ? achievementRow(game, def) : undefined;
}

const ORDER: Record<AchievementRowStatus, number> = { claimable: 0, progress: 1, claimed: 2 };

/** 한 탭의 수령형 행 목록 — claimable을 맨 위에, 그 아래 진행 중, 마지막에 받은 순이다 */
export function achievementRows(game: GameState, tab: Exclude<AchievementTab, 'bonus'>): AchievementRow[] {
  return ACHIEVEMENTS.filter(a => a.tab === tab)
    .map(a => achievementRow(game, a))
    .sort((x, y) => ORDER[x.status] - ORDER[y.status]);
}

/** 탭별 받을 수 있는 업적 수 */
export function tabClaimableCount(game: GameState, tab: AchievementTab): number {
  if (tab === 'bonus') return 0;
  return ACHIEVEMENTS.filter(a => a.tab === tab && game.achievements[a.id] === 'claimable').length;
}

/** 받을 수 있는 업적의 수 — 메뉴 줄 배지와 요약 줄·탭 목록이 같은 카탈로그를 쓴다 */
export function claimableCount(game: GameState): number {
  return ACHIEVEMENTS.filter(a => game.achievements[a.id] === 'claimable').length;
}

/**
 * 액션 확정 뒤 새로 받을 수 있게 된 업적의 이름표 — 메시지 창 한 줄 알림의 재료다.
 * 이전 상태에서 claimable이 아니었던 업적이 새 상태에서 claimable이면 뽑는다.
 */
export function newlyClaimable(before: GameState, after: GameState): string[] {
  return ACHIEVEMENTS.filter(a => after.achievements[a.id] === 'claimable' && before.achievements[a.id] !== 'claimable')
    .map(a => a.name);
}

/** 상단 요약 줄 — 받은 수, 받을 골드 합, 받을 모자 수, 모두 받기 가능 여부 */
export function achievementSummary(game: GameState, guest = false): {
  claimed: number;
  total: number;
  gold: number;
  hats: number;
  canClaimAll: boolean;
} {
  let gold = 0;
  let hats = 0;
  for (const a of ACHIEVEMENTS) {
    if (game.achievements[a.id] !== 'claimable') continue;
    if (a.reward.kind === 'gold') gold += a.reward.gold;
    else hats += 1;
  }
  return {
    claimed: ACHIEVEMENTS.filter(a => game.achievements[a.id] === 'claimed').length,
    total: ACHIEVEMENTS.length,
    gold,
    hats,
    canClaimAll: canClaimAllAchievements(game, guest).ok,
  };
}

/** 누적 보너스 탭의 다단계 카드 23장 */
export function cumulativeBonusCards(game: GameState): CumulativeBonusCardModel[] {
  return CUMULATIVE_BONUS_SERIES.map(series => {
    const p = cumulativeBonusProgress(game, series);
    const sign = bonusSignOf(series.bonusKind);
    const effectLabel = bonusEffectLabelOf(series);
    const lastStep = series.steps[series.steps.length - 1];
    const nextThreshold = p.nextStep?.threshold ?? lastStep.threshold;
    const allDone = p.nextStep === null;
    const scopeLabel = series.scope === 'global'
      ? '전역'
      : (zoneById(series.zone!)?.shortName ?? series.zone!);

    let nowAssigned = false;
    const steps: CumulativeBonusStepView[] = series.steps.map(step => {
      const done = p.current >= step.threshold;
      let state: 'done' | 'now' | 'todo' = 'todo';
      if (done) {
        state = 'done';
      } else if (!nowAssigned) {
        state = 'now';
        nowAssigned = true;
      }
      return {
        id: step.id,
        label: step.label,
        deltaText: fmtPct(step.delta, sign),
        state,
      };
    });

    const activeText = p.activeDelta > 0
      ? `${effectLabel} ${fmtPct(p.activeDelta, sign)}`
      : `${effectLabel} 적용 전`;
    const maxText = `최대 누적 ${fmtPct(p.maxDelta, sign)} (달성 즉시 자동 적용)`;
    const nextDeltaText = p.nextStep ? fmtPct(p.nextStep.delta, sign) : null;

    return {
      series,
      icon: bonusIconOf(series),
      scopeLabel,
      current: p.current,
      nextThreshold,
      nextDeltaText,
      allDone,
      activeText,
      maxText,
      steps,
    };
  });
}

const COSMETIC_SCOPE_LABEL: Record<CosmeticKind, string> = {
  named: '네임드',
  night: '한밤',
  variant: '돌연변이',
  big: '월척',
  general: '수집',
};

/** 치장 탭 카드 목록 — 네임드 1·5·10회는 다단계 압축 카드로 묶고, 미토벌 네임드는 실명을 가린다 */
export function cosmeticCards(game: GameState, filter: CosmeticFilter = 'all'): CosmeticCardItem[] {
  const cosmeticDefs = ACHIEVEMENTS.filter(a => a.tab === 'cosmetic');
  const filtered = filter === 'all'
    ? cosmeticDefs
    : cosmeticDefs.filter(a => a.cosmeticKind === filter);

  const items: CosmeticCardItem[] = [];
  const groupedNamed = new Map<string, AchievementDef[]>();

  for (const def of filtered) {
    if (def.groupId && def.namedId) {
      const list = groupedNamed.get(def.groupId);
      if (list) list.push(def);
      else groupedNamed.set(def.groupId, [def]);
    } else {
      items.push({
        kind: 'single',
        row: achievementRow(game, def),
        scopeLabel: def.cosmeticKind ? COSMETIC_SCOPE_LABEL[def.cosmeticKind] : '수집',
      });
    }
  }

  for (const [groupId, defs] of groupedNamed.entries()) {
    const rows = defs.map(d => achievementRow(game, d));
    const first = defs[0];
    const namedId = first.namedId!;
    const current = rows[0].progress.current;
    const discovered = current > 0 || rows.some(r => r.status !== 'progress');
    const place = namedSpoilerPlace(namedId);
    const namedName = namedById(namedId)?.name ?? place;
    const title = discovered ? `${namedName} 토벌` : `${place} 네임드 토벌`;
    const desc = discovered
      ? `${namedName} 토벌을 여러 번 마쳐 표식을 모아요.`
      : `${place}의 숨은 존재를 토벌해요.`;

    const claimableRow = rows.find(r => r.status === 'claimable');
    const nextProgressRow = rows.find(r => r.status === 'progress');
    const allClaimed = rows.every(r => r.status === 'claimed');
    const status: AchievementRowStatus = claimableRow ? 'claimable' : allClaimed ? 'claimed' : 'progress';
    const activeRow = claimableRow ?? nextProgressRow ?? rows[rows.length - 1];

    const steps: NamedGroupStepView[] = rows.map(r => {
      const hatId = r.def.reward.kind === 'hat' ? r.def.reward.hatId : '';
      const hatName = hatById(hatId)?.name ?? '모자';
      return {
        id: r.def.id,
        threshold: r.progress.target,
        hatId,
        hatName,
        status: r.status,
        label: `${r.progress.target}회`,
      };
    });

    items.push({
      kind: 'namedGroup',
      groupId,
      namedId,
      discovered,
      title,
      desc,
      scopeLabel: '네임드',
      current,
      target: activeRow.progress.target,
      status,
      activeRow,
      steps,
    });
  }

  const statusOf = (item: CosmeticCardItem): AchievementRowStatus =>
    item.kind === 'single' ? item.row.status : item.status;

  return items.sort((a, b) => ORDER[statusOf(a)] - ORDER[statusOf(b)]);
}

export interface ProgressZoneGroup {
  zone: ZoneId;
  zoneName: string;
  items: AchievementRow[];
  claimedCount: number;
}

/** 진행 탭 해역 업적을 구역 소제목별로 묶는다. 미완료만 보기 필터가 켜지면 claimed를 제외한다 */
export function progressZoneGroups(game: GameState, incompleteOnly = false): ProgressZoneGroup[] {
  const rows = achievementRows(game, 'progress').filter(r => !incompleteOnly || r.status !== 'claimed');
  const groups: ProgressZoneGroup[] = [];
  const byZone = new Map<ZoneId, ProgressZoneGroup>();
  for (const r of rows) {
    const zone = (r.def.zone ?? 'village') as ZoneId;
    let group = byZone.get(zone);
    if (!group) {
      group = { zone, zoneName: zoneById(zone)?.shortName ?? zone, items: [], claimedCount: 0 };
      byZone.set(zone, group);
      groups.push(group);
    }
    group.items.push(r);
    if (r.status === 'claimed') group.claimedCount += 1;
  }
  return groups;
}

export interface CosmeticFilterStat {
  achieved: number;
  total: number;
  claimable: number;
}

/** 치장 탭 필터별 완료 수·전체 수·수령 가능 수 집계 */
export function cosmeticFilterStats(game: GameState): Record<CosmeticFilter, CosmeticFilterStat> {
  const out: Record<CosmeticFilter, CosmeticFilterStat> = {
    all: { achieved: 0, total: 0, claimable: 0 },
    named: { achieved: 0, total: 0, claimable: 0 },
    night: { achieved: 0, total: 0, claimable: 0 },
    variant: { achieved: 0, total: 0, claimable: 0 },
    big: { achieved: 0, total: 0, claimable: 0 },
    general: { achieved: 0, total: 0, claimable: 0 },
  };
  for (const def of ACHIEVEMENTS) {
    if (def.tab !== 'cosmetic') continue;
    const st = rowStatusOf(game, def.id);
    const keys: CosmeticFilter[] = def.cosmeticKind ? ['all', def.cosmeticKind] : ['all'];
    for (const key of keys) {
      out[key].total += 1;
      if (st === 'claimed') out[key].achieved += 1;
      if (st === 'claimable') out[key].claimable += 1;
    }
  }
  return out;
}

/** 행의 받기 버튼 가능 여부 — 규칙의 수령 판정을 그대로 쓴다 */
export function canClaim(game: GameState, id: string, guest = false): boolean {
  return canClaimAchievement(game, id, guest).ok;
}

/** 모자 칸의 해금 업적 — 업적 모자면 그 업적, 골드 모자면 undefined */
export const achievementForHat = achievementForHatId;
