// 업적 창의 파생 모델 — 판정(진척, 수령 가능, 누적 보너스)은 게임 규칙의 순수 함수를 그대로 쓰고,
// 여기서는 화면이 읽을 값(요약 줄, 칩 바, 3탭 목록, 다단계 압축 카드, 행 상태)으로 묶는다.
import {
  ACHIEVEMENTS,
  CUMULATIVE_BONUS_SERIES,
  LEGACY_ACHIEVEMENT_DEFS,
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
import { zoneById } from '../../../game/content/zones';
import {
  achievementBonusContributions,
  achievementBonusesOf,
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

export interface CumulativeBonusCardModel {
  series: CumulativeBonusSeries;
  scopeLabel: string;
  current: number;
  nextThreshold: number;
  allDone: boolean;
  activeText: string;
  maxText: string;
  steps: CumulativeBonusStepView[];
}

/** 상단 적용 중인 누적 보너스 칩 모델 */
export interface ActiveBonusChip {
  id: string;
  label: string;
  valueText: string;
  rows: [string, string][];
  foot: string;
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
    case 'namedWeight': return '네임드 조우 가중치';
    case 'moveSpeed': return '이동 속도';
    case 'artifactBoost': return '보유 유물 효과';
    case 'zoneLegendary': return `${zoneName} 전설 가중치`;
    case 'zoneMutation': return `${zoneName} 돌연변이 가중치`;
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

/** 받을 수 있는 업적의 수 — 메뉴 줄 배지와 요약 줄이 같은 값을 쓴다(옛 미수령 업적 포함) */
export function claimableCount(game: GameState): number {
  const active = ACHIEVEMENTS.filter(a => game.achievements[a.id] === 'claimable').length;
  const legacy = LEGACY_ACHIEVEMENT_DEFS.filter(a => game.achievements[a.id] === 'claimable').length;
  return active + legacy;
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
  for (const legacy of LEGACY_ACHIEVEMENT_DEFS) {
    if (game.achievements[legacy.id] === 'claimable') gold += legacy.reward.gold;
  }
  return {
    claimed: ACHIEVEMENTS.filter(a => game.achievements[a.id] === 'claimed').length,
    total: ACHIEVEMENTS.length,
    gold,
    hats,
    canClaimAll: canClaimAllAchievements(game, guest).ok,
  };
}

/** 누적 보너스 탭의 다단계 카드 21장 */
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
    const maxText = `최대 ${fmtPct(p.maxDelta, sign)}`;

    return {
      series,
      scopeLabel,
      current: p.current,
      nextThreshold,
      allDone,
      activeText,
      maxText,
      steps,
    };
  });
}

/** 상단 적용 중인 누적 보너스 칩 바 */
export function activeBonusChips(game: GameState): ActiveBonusChip[] {
  const totals = achievementBonusesOf(game);
  const contribs = achievementBonusContributions(game);
  const chips: ActiveBonusChip[] = [];

  if (totals.biteWaitCut > 0) {
    chips.push({
      id: 'biteWaitCut',
      label: '입질 대기',
      valueText: fmtPct(totals.biteWaitCut, '−'),
      rows: contribs
        .filter(c => c.series.bonusKind === 'biteWaitCut')
        .map(c => [c.series.name, fmtPct(c.activeDelta, '−')]),
      foot: '같은 종류의 보너스는 모두 더해 한 번만 적용돼요.',
    });
  }

  const mutContribs = contribs.filter(c => c.series.bonusKind === 'mutationWeight' || c.series.bonusKind === 'zoneMutation');
  if (mutContribs.length > 0) {
    const maxZoneMut = Math.max(0, ...Object.values(totals.zoneMutation).filter((v): v is number => typeof v === 'number'));
    const displaySum = Math.round((totals.mutationWeight + maxZoneMut) * 1e9) / 1e9;
    chips.push({
      id: 'mutationWeight',
      label: '돌연변이 가중치',
      valueText: fmtPct(displaySum, '+'),
      rows: mutContribs.map(c => [
        c.series.name,
        c.series.scope === 'zone' && c.series.zone
          ? `${zoneById(c.series.zone)?.shortName ?? c.series.zone} ${fmtPct(c.activeDelta, '+')}`
          : fmtPct(c.activeDelta, '+'),
      ]),
      foot: '구역 보너스는 그 구역에서 낚시할 때만 적용돼요.',
    });
  }

  const legContribs = contribs.filter(c => c.series.bonusKind === 'zoneLegendary');
  if (legContribs.length > 0) {
    const maxZoneLeg = Math.max(0, ...Object.values(totals.zoneLegendary).filter((v): v is number => typeof v === 'number'));
    chips.push({
      id: 'zoneLegendary',
      label: '전설 가중치',
      valueText: fmtPct(maxZoneLeg, '+'),
      rows: legContribs.map(c => [
        c.series.name,
        `${zoneById(c.series.zone!)?.shortName ?? c.series.zone} ${fmtPct(c.activeDelta, '+')}`,
      ]),
      foot: '구역 보너스는 그 구역에서 낚시할 때만 적용돼요.',
    });
  }

  if (totals.namedWeight > 0) {
    chips.push({
      id: 'namedWeight',
      label: '네임드 조우',
      valueText: fmtPct(totals.namedWeight, '+'),
      rows: contribs
        .filter(c => c.series.bonusKind === 'namedWeight')
        .map(c => [c.series.name, fmtPct(c.activeDelta, '+')]),
      foot: '같은 종류의 보너스는 모두 더해 한 번만 적용돼요.',
    });
  }

  if (totals.moveSpeed > 0) {
    chips.push({
      id: 'moveSpeed',
      label: '이동 속도',
      valueText: fmtPct(totals.moveSpeed, '+'),
      rows: contribs
        .filter(c => c.series.bonusKind === 'moveSpeed')
        .map(c => [c.series.name, fmtPct(c.activeDelta, '+')]),
      foot: '달성한 단계마다 효과가 더해져 적용돼요.',
    });
  }

  if (totals.artifactBoost > 0) {
    chips.push({
      id: 'artifactBoost',
      label: '유물 효과',
      valueText: fmtPct(totals.artifactBoost, '+'),
      rows: contribs
        .filter(c => c.series.bonusKind === 'artifactBoost')
        .map(c => [c.series.name, fmtPct(c.activeDelta, '+')]),
      foot: '보유 유물의 수치 효과에 배율이 더해져요.',
    });
  }

  return chips;
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
      : `${place}의 네임드를 토벌해요.`;

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

/** 행의 받기 버튼 가능 여부 — 규칙의 수령 판정을 그대로 쓴다 */
export function canClaim(game: GameState, id: string, guest = false): boolean {
  return canClaimAchievement(game, id, guest).ok;
}

/** 모자 칸의 해금 업적 — 업적 모자면 그 업적, 골드 모자면 undefined */
export const achievementForHat = achievementForHatId;
