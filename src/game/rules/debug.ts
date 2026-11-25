// 개발 도구 서버 명령 — debug 액션의 리듀서 몫(서버·로컬 게이트웨이 공유).
// 새 규칙·수치를 두지 않는다. 각 명령은 기존 규칙 함수(도감 판정·지원 코드 지급·아이템 지급·업적 평가)를
// 엮는 얇은 어댑터다. 전용 테이블(수주·진행·도전권)을 바꾸는 명령은 상태를 그대로 두고,
// 서버가 감사 이벤트를 보고 행을 쓴다. 허용 판정(운영 차단)은 서버 몫이다.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import {
  applyRelief, LICENSE_GRADES, MAX_BOAT, addItem, isBigSize, makeInstance, migrate,
  nextDexRec, sizeParams, zoneDexMissing,
} from './logic.js';
import type { Fish, FormId, GameState } from './logic.js';
import { settleCooking } from './cooking.js';
import { achievementProgress, evaluateAchievements } from './achievements.js';
import { BOUNTIES, BOUNTY_ZONES, bountyById, bountyKindOf, isBountyKind } from '../content/bounties.js';
import type { BountyKind, BountyZone } from '../content/bounties.js';
import { ARTIFACT_MAX_LEVEL, ARTIFACTS, artifactById, artifactHasLevel } from '../content/artifacts.js';
import { FISH, fishById } from '../content/fish.js';
import { NAMED, namedById } from '../content/named.js';
import { HATS, hatById } from '../content/wardrobe.js';
import { ZONE_IDS, topZoneOf, topZoneOfSpot, zoneById, zoneOfSpot } from '../content/zones.js';
import type { ZoneId } from '../content/zones.js';
import {
  COOK_KIND_RULES, isEnergyAmount, isEnergyItemId, recipeById, toStoredEnergy,
} from '../content/cooking.js';
import { isStackableItemId } from '../content/itemCatalog.js';
import {
  ACHIEVEMENTS, achievementById, isAchievementCounterKey,
} from '../content/achievements.js';
import type { AchievementMap } from '../content/achievements.js';

/** 상태를 바꾸는 명령 */
const STATE_COMMANDS = [
  'stats.set',
  'dex.completeZone',
  'dex.fill',
  'dex.reset',
  'named.unlock',
  'named.reset',
  'items.grant',
  'cooking.finish',
  'artifact.set',
  'hat.set',
  'achievement.setCounter',
  'achievement.resetCounters',
  'achievement.evaluate',
  'bag.spawn',
  'bounty.grantMaterial',
  'snapshot.restore',
] as const;

/** 전용 테이블만 바꾸는 명령 — 리듀서는 상태를 그대로 둔다 */
export const DEBUG_TABLE_COMMANDS = [
  'bounty.expireTickets',
  'bounty.clearTickets',
  'bounty.resetToday',
  'bounty.clearProgress',
] as const;

export type DebugCommandId = typeof STATE_COMMANDS[number] | typeof DEBUG_TABLE_COMMANDS[number];
export type DebugTableCommand = typeof DEBUG_TABLE_COMMANDS[number];
export type BountyResetKind = 'all' | BountyKind;
export const DEBUG_COMMAND_IDS: readonly DebugCommandId[] = [...STATE_COMMANDS, ...DEBUG_TABLE_COMMANDS];

export interface BountyClearSnapshot {
  kind: BountyKind;
  questId: string;
  clearedAt: string;
}

export interface BountyProgressSnapshot {
  zone: BountyZone;
  questId: string;
  progress: number;
  startedAt: string;
}

export interface BountyTicketSnapshot {
  questId: string;
  issuedAt: string;
}

export interface DevBountySnapshot {
  clears: BountyClearSnapshot[];
  progress: BountyProgressSnapshot[];
  tickets: BountyTicketSnapshot[];
}

export const isDebugTableCommand = (command: string): command is DebugTableCommand =>
  (DEBUG_TABLE_COMMANDS as readonly string[]).includes(command);

/** 역방향 초기화 뒤 현재 상태 기준으로 조건이 깨진 미수령('claimable') 업적 상태를 회수한다 */
export function revokeUnmetClaimableAchievements(state: GameState): GameState {
  let changed = false;
  const next: AchievementMap = { ...state.achievements };
  for (const [id, status] of Object.entries(next)) {
    if (status !== 'claimable') continue;
    if (!achievementProgress(state, id).met) {
      delete next[id];
      changed = true;
    }
  }
  return changed ? { ...state, achievements: next } : state;
}

/** 수배 구역 목록 */
export const DEBUG_ZONES: readonly BountyZone[] = BOUNTY_ZONES;

const zoneArg = (args: Record<string, unknown>): BountyZone | null =>
  DEBUG_ZONES.includes(args.zone as BountyZone) ? args.zone as BountyZone : null;

const isGrantableItem = (id: string): boolean => isStackableItemId(id);

const namedQuestIdOf = (namedId: string): string | undefined =>
  BOUNTIES.find(q => q.difficulty === 'named' && q.targetFish === namedId)?.id;

function bigSizeFor(fish: Fish): number {
  const { mean, std } = sizeParams(fish);
  let size = Math.ceil((mean + 2.5 * std) * 10) / 10;
  while (!isBigSize(fish, size)) size = Math.ceil((size + std * 0.5) * 10) / 10;
  return size;
}

function matchFishZone(fish: Fish, zone: string): boolean {
  if (zone === 'all') return true;
  if ((ZONE_IDS as readonly string[]).includes(zone)) return topZoneOfSpot(fish.spot) === zone;
  return zoneOfSpot(fish.spot) === zone;
}

function matchZoneArg(zone: unknown): string | null {
  if (zone === 'all') return 'all';
  if (typeof zone !== 'string') return null;
  return zoneById(zone as ZoneId) ? zone : null;
}

/** stats.set 인자 — 준 값만 바꾼다. 빈 입력·음수·비정수 낚싯대·범위 밖 배는 거부 */
function setStats(state: GameState, args: Record<string, unknown>): GameState | null {
  const keys = ['gold', 'fame', 'rod', 'boat'] as const;
  const next: Partial<Record<typeof keys[number], number>> = {};
  for (const key of keys) {
    const v = args[key];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
    next[key] = v;
  }
  if (Object.keys(next).length === 0) return null;
  if (next.rod !== undefined && (!Number.isInteger(next.rod) || next.rod < 1)) return null;
  if (next.boat !== undefined && (!Number.isInteger(next.boat) || next.boat > MAX_BOAT)) return null;
  return { ...state, ...next };
}

/** dex.completeZone — 네임드 라이선스 도감 판정이 비었다고 보는 어종만 일반 폼 1마리로 채운다.
 *  지원 코드 지급 경로(applyRelief)로 합쳐 기존 기록은 그대로 둔다 */
function completeZoneDex(state: GameState, zone: BountyZone, today: string): GameState {
  const missing = zoneDexMissing(state, zone, LICENSE_GRADES.named);
  const dex: GameState['dex'] = Object.fromEntries(
    missing.map(id => [id, { normal: nextDexRec(undefined, null, today) }]),
  );
  return applyRelief(state, { gold: 0, fame: 0, rod: 0, boat: 0, dex });
}

/** dex.fill — 마을 포함 구역 또는 전체 도감을 지정 폼(normal/variant/both), 대어, 네임드 포함 여부로 채운다 */
function fillDex(state: GameState, args: Record<string, unknown>, today: string): GameState | null {
  const zone = matchZoneArg(args.zone);
  if (!zone) return null;
  const rawForm = args.form ?? 'both';
  if (rawForm !== 'normal' && rawForm !== 'variant' && rawForm !== 'both') return null;
  if (args.big !== undefined && typeof args.big !== 'boolean') return null;
  if (args.includeNamed !== undefined && typeof args.includeNamed !== 'boolean') return null;
  const big = args.big === true;
  const includeNamed = args.includeNamed === true;
  const forms: FormId[] = rawForm === 'both' ? ['normal', 'variant'] : [rawForm];
  const dex: GameState['dex'] = { ...state.dex };

  for (const fish of FISH) {
    if (!matchFishZone(fish, zone)) continue;
    const prevForms = dex[fish.id] ?? {};
    const nextForms = { ...prevForms };
    const bigSize = big ? bigSizeFor(fish) : null;
    for (const form of forms) {
      const existing = nextForms[form];
      if (!existing || existing.count <= 0) {
        nextForms[form] = nextDexRec(undefined, bigSize, today);
      } else if (bigSize !== null) {
        nextForms[form] = { ...existing, maxSize: Math.max(existing.maxSize ?? 0, bigSize) };
      }
    }
    dex[fish.id] = nextForms;
  }

  let clearedNamed = state.clearedNamed;
  if (includeNamed) {
    const topZone = zone === 'all' ? 'all' : topZoneOf(zone as ZoneId);
    const nextCleared = [...clearedNamed];
    for (const named of NAMED) {
      if (topZone === 'all' || named.zones.includes(topZone as BountyZone)) {
        const existing = dex[named.id]?.normal;
        if (!existing || existing.count <= 0) {
          dex[named.id] = { ...dex[named.id], normal: nextDexRec(undefined, null, today) };
        }
        const qid = namedQuestIdOf(named.id);
        if (qid && !nextCleared.includes(qid)) nextCleared.push(qid);
      }
    }
    clearedNamed = nextCleared;
  }
  return { ...state, dex, clearedNamed };
}

/** dex.reset — 지정 구역 또는 전체 도감 초기화(선택 시 네임드 도감·토벌 기록 포함) */
function resetDex(state: GameState, args: Record<string, unknown>): GameState | null {
  const zone = matchZoneArg(args.zone);
  if (!zone) return null;
  if (args.includeNamed !== undefined && typeof args.includeNamed !== 'boolean') return null;
  const includeNamed = args.includeNamed === true;
  const dex: GameState['dex'] = { ...state.dex };

  for (const fish of FISH) {
    if (matchFishZone(fish, zone)) delete dex[fish.id];
  }

  let clearedNamed = state.clearedNamed;
  if (includeNamed) {
    const topZone = zone === 'all' ? 'all' : topZoneOf(zone as ZoneId);
    const removedQuests = new Set<string>();
    for (const named of NAMED) {
      if (topZone === 'all' || named.zones.includes(topZone as BountyZone)) {
        delete dex[named.id];
        const qid = namedQuestIdOf(named.id);
        if (qid) removedQuests.add(qid);
      }
    }
    if (removedQuests.size > 0) {
      clearedNamed = clearedNamed.filter(id => !removedQuests.has(id));
    }
  }
  return revokeUnmetClaimableAchievements({ ...state, dex, clearedNamed });
}

/** named.unlock / named.reset — 네임드 도감과 토벌 기록을 함께 갱신·삭제한다 */
function setNamed(state: GameState, args: Record<string, unknown>, unlock: boolean, today: string): GameState | null {
  const raw = args.namedId;
  if (typeof raw !== 'string') return null;
  if (unlock && args.consumeDailyCap !== undefined && typeof args.consumeDailyCap !== 'boolean') return null;
  const targets = raw === 'all' ? NAMED : (() => {
    const n = namedById(raw);
    return n ? [n] : null;
  })();
  if (!targets) return null;

  const dex: GameState['dex'] = { ...state.dex };
  let clearedNamed = [...state.clearedNamed];

  for (const named of targets) {
    const qid = namedQuestIdOf(named.id);
    if (unlock) {
      const existing = dex[named.id]?.normal;
      if (!existing || existing.count <= 0) {
        dex[named.id] = { ...dex[named.id], normal: nextDexRec(undefined, null, today) };
      }
      if (qid && !clearedNamed.includes(qid)) clearedNamed.push(qid);
    } else {
      delete dex[named.id];
      if (qid) clearedNamed = clearedNamed.filter(id => id !== qid);
    }
  }
  const next = { ...state, dex, clearedNamed };
  return unlock ? next : revokeUnmetClaimableAchievements(next);
}

/** items.grant — 기운 4종, 요리 10종, 유물 재료 8종 지급 */
function grantItems(state: GameState, args: Record<string, unknown>): GameState | null {
  const itemId = args.itemId;
  if (typeof itemId !== 'string' || !isGrantableItem(itemId)) return null;
  const count = args.count === undefined ? 1 : args.count;
  if (isEnergyItemId(itemId)) {
    if (typeof count !== 'number' || !isEnergyAmount(count) || count <= 0) return null;
    return addItem(state, itemId, toStoredEnergy(count));
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) return null;
  return addItem(state, itemId, count);
}

/** cooking.finish — 진행 중인 조리를 즉시 완료해 보관함으로 옮긴다 */
function finishCooking(state: GameState, now: string): GameState {
  const cooking = state.cooking;
  if (!cooking) return state;
  const recipe = recipeById(cooking.recipe);
  if (!recipe) return state;
  const totalWaitMs = COOK_KIND_RULES[recipe.kind].waitMs * cooking.count;
  const nowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now();
  const startedAt = new Date(nowMs - totalWaitMs - 1000).toISOString();
  return settleCooking({ ...state, cooking: { ...cooking, startedAt } }, now);
}

/** artifact.set — 유물 보유 여부 및 레벨(0=회수, 1..5=보유+레벨) 설정 */
function setArtifact(state: GameState, args: Record<string, unknown>): GameState | null {
  const raw = args.artifact;
  if (typeof raw !== 'string') return null;
  const targets = raw === 'all' ? ARTIFACTS : (() => {
    const a = artifactById(raw);
    return a ? [a] : null;
  })();
  if (!targets) return null;
  const level = args.level === undefined ? 1 : args.level;
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > ARTIFACT_MAX_LEVEL) return null;

  let artifacts = [...state.artifacts];
  const levels: Record<string, number> = { ...state.artifactLevels };

  for (const art of targets) {
    if (level === 0) {
      artifacts = artifacts.filter(id => id !== art.id);
      delete levels[art.id];
    } else {
      if (!artifacts.includes(art.id)) artifacts.push(art.id);
      if (artifactHasLevel(art) && level > 1) levels[art.id] = level;
      else delete levels[art.id];
    }
  }
  const { artifactLevels: _prevLevels, ...rest } = state;
  const next: GameState = {
    ...rest,
    artifacts,
    ...(Object.keys(levels).length > 0 ? { artifactLevels: levels } : {}),
  };
  return level === 0 ? revokeUnmetClaimableAchievements(next) : next;
}

/** hat.set — 모자 해금 또는 회수(착용 중이던 모자가 회수되면 벗는다) */
function setHat(state: GameState, args: Record<string, unknown>): GameState | null {
  const raw = args.hat;
  if (typeof raw !== 'string') return null;
  const targets = raw === 'all' ? HATS : (() => {
    const h = hatById(raw);
    return h ? [h] : null;
  })();
  if (!targets) return null;
  const owned = args.owned === undefined ? true : args.owned;
  if (typeof owned !== 'boolean') return null;

  const targetIds = new Set(targets.map(h => h.id));
  let hats: string[];
  if (owned) {
    hats = [...state.hats];
    for (const h of targets) {
      if (!hats.includes(h.id)) hats.push(h.id);
    }
  } else {
    hats = state.hats.filter(id => !targetIds.has(id));
  }
  const look = state.look.hat !== null && !hats.includes(state.look.hat)
    ? { ...state.look, hat: null }
    : state.look;
  const next = { ...state, hats, look };
  return owned ? next : revokeUnmetClaimableAchievements(next);
}

/** achievement.setCounter — 카운터 절대값 설정 */
function setAchievementCounter(state: GameState, args: Record<string, unknown>): GameState | null {
  const key = args.key;
  const value = args.value;
  if (typeof key !== 'string' || !isAchievementCounterKey(key)) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  const next = { ...state.achievementCounters };
  if (value === 0) delete next[key];
  else next[key] = value;
  return { ...state, achievementCounters: next };
}

/** achievement.resetCounters — 지정 키 또는 전체 카운터 초기화 */
function resetAchievementCounters(state: GameState, args: Record<string, unknown>): GameState | null {
  const key = args.key;
  if (args.resetAchievements !== undefined && typeof args.resetAchievements !== 'boolean') return null;
  let next = { ...state.achievementCounters };
  if (key !== undefined && key !== '') {
    if (typeof key !== 'string' || !isAchievementCounterKey(key)) return null;
    delete next[key];
  } else {
    next = {};
  }
  const achievements = args.resetAchievements === true ? {} : state.achievements;
  const result = { ...state, achievementCounters: next, achievements };
  return args.resetAchievements === true ? result : revokeUnmetClaimableAchievements(result);
}

/** achievement.evaluate — 업적 재평가 또는 상태 지정 */
function evaluateDebugAchievements(state: GameState, args: Record<string, unknown>): GameState | null {
  const rawId = args.id;
  const rawStatus = args.status ?? 'recompute';
  if (rawStatus !== 'recompute' && rawStatus !== 'claimable' && rawStatus !== 'claimed' && rawStatus !== 'reset') {
    return null;
  }
  if (rawId !== undefined && rawId !== '' && rawId !== 'all') {
    if (typeof rawId !== 'string' || !achievementById(rawId)) return null;
    const next: AchievementMap = { ...state.achievements };
    if (rawStatus === 'reset') {
      delete next[rawId];
      return { ...state, achievements: next };
    }
    if (rawStatus === 'recompute') {
      delete next[rawId];
      const evaluated = evaluateAchievements({ ...state, achievements: next });
      return { ...state, achievements: evaluated.achievements };
    }
    next[rawId] = rawStatus;
    return { ...state, achievements: next };
  }

  if (rawStatus === 'reset') return { ...state, achievements: {} };
  if (rawStatus === 'recompute') {
    const fresh = evaluateAchievements({ ...state, achievements: {} }).achievements;
    const next: AchievementMap = {};
    for (const a of ACHIEVEMENTS) {
      if (state.achievements[a.id] === 'claimed' && fresh[a.id] === 'claimable') next[a.id] = 'claimed';
      else if (fresh[a.id]) next[a.id] = fresh[a.id];
    }
    return { ...state, achievements: next };
  }
  const next: AchievementMap = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, rawStatus]));
  return { ...state, achievements: next };
}

/** bag.spawn — 특정 어종·폼·크기·수량의 개체를 가방에 생성한다 */
function spawnBagFish(
  state: GameState, args: Record<string, unknown>, now: string, newUid: () => string,
): GameState | null {
  const fish = fishById(args.fishId);
  if (!fish) return null;
  const form = args.form ?? 'normal';
  if (form !== 'normal' && form !== 'variant') return null;
  if (args.big !== undefined && typeof args.big !== 'boolean') return null;
  const count = args.count === undefined ? 1 : args.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 50) return null;

  let size: number;
  if (args.size !== undefined) {
    if (typeof args.size !== 'number' || !Number.isFinite(args.size) || args.size <= 0) return null;
    size = args.size;
  } else if (args.big === true) {
    size = bigSizeFor(fish);
  } else {
    size = Math.round(sizeParams(fish).mean * 10) / 10;
  }

  const spawned = Array.from({ length: count }, () =>
    makeInstance(fish, { form, size }, { uid: newUid(), now, spot: fish.spot, judgment: 'normal' }),
  );
  return { ...state, bag: [...state.bag, ...spawned] };
}

const SNAPSHOT_MAX_INSTANCES = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isSnapshotScalarValid = (v: unknown, min: number, max?: number): boolean =>
  typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= min && (max === undefined || v <= max);

function validateSnapshotInstances(
  list: unknown, allowEmptySlots: boolean, seenUids: Set<string>,
): boolean {
  if (list === undefined) return true;
  if (!Array.isArray(list) || list.length > SNAPSHOT_MAX_INSTANCES) return false;
  for (const item of list) {
    if (allowEmptySlots && (item === null || item === undefined)) continue;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const uid = (item as { uid?: unknown }).uid;
    if (typeof uid !== 'string' || !UUID_PATTERN.test(uid)) return false;
    const key = uid.toLowerCase();
    if (seenUids.has(key)) return false;
    seenUids.add(key);
  }
  return true;
}

/** 스냅샷에 실린 수배 DB 행 묶음의 형태를 검증·정규화한다 */
export function parseSnapshotBounty(raw: unknown): DevBountySnapshot | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.clears) || !Array.isArray(obj.progress) || !Array.isArray(obj.tickets)) return null;
  if (obj.clears.length > SNAPSHOT_MAX_INSTANCES || obj.progress.length > SNAPSHOT_MAX_INSTANCES || obj.tickets.length > SNAPSHOT_MAX_INSTANCES) {
    return null;
  }
  const clears: BountyClearSnapshot[] = [];
  for (const item of obj.clears) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const c = item as Record<string, unknown>;
    if (typeof c.kind !== 'string' || !isBountyKind(c.kind)) return null;
    if (typeof c.questId !== 'string') return null;
    const quest = bountyById(c.questId);
    if (!quest || bountyKindOf(quest) !== c.kind) return null;
    if (typeof c.clearedAt !== 'string' || !Number.isFinite(Date.parse(c.clearedAt))) return null;
    clears.push({ kind: c.kind, questId: c.questId, clearedAt: c.clearedAt });
  }
  const progress: BountyProgressSnapshot[] = [];
  const seenProgress = new Set<string>();
  for (const item of obj.progress) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const p = item as Record<string, unknown>;
    if (typeof p.questId !== 'string') return null;
    const quest = bountyById(p.questId);
    if (!quest || seenProgress.has(p.questId)) return null;
    seenProgress.add(p.questId);
    if (p.zone !== undefined && p.zone !== quest.zone) return null;
    if (typeof p.progress !== 'number' || !Number.isInteger(p.progress) || p.progress < 0) return null;
    if (typeof p.startedAt !== 'string' || !Number.isFinite(Date.parse(p.startedAt))) return null;
    progress.push({ zone: quest.zone, questId: p.questId, progress: p.progress, startedAt: p.startedAt });
  }
  const tickets: BountyTicketSnapshot[] = [];
  const seenTickets = new Set<string>();
  for (const item of obj.tickets) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const t = item as Record<string, unknown>;
    if (typeof t.questId !== 'string') return null;
    const quest = bountyById(t.questId);
    if (!quest || quest.difficulty !== 'named' || seenTickets.has(t.questId)) return null;
    seenTickets.add(t.questId);
    if (typeof t.issuedAt !== 'string' || !Number.isFinite(Date.parse(t.issuedAt))) return null;
    tickets.push({ questId: t.questId, issuedAt: t.issuedAt });
  }
  return { clears, progress, tickets };
}

/** snapshot.restore — 저장된 스냅샷으로 상태 전체를 복원한다 */
function restoreSnapshot(args: Record<string, unknown>, newUid: () => string): GameState | null {
  const raw = args.snapshot;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  if (src.gold !== undefined && !isSnapshotScalarValid(src.gold, 0)) return null;
  if (src.fame !== undefined && !isSnapshotScalarValid(src.fame, 0)) return null;
  if (src.boat !== undefined && !isSnapshotScalarValid(src.boat, 0, MAX_BOAT)) return null;
  if (src.rod !== undefined && !isSnapshotScalarValid(src.rod, 1)) return null;

  const seenUids = new Set<string>();
  if (!validateSnapshotInstances(src.bag, false, seenUids)) return null;
  if (!validateSnapshotInstances(src.exhibit, true, seenUids)) return null;

  let bounty: DevBountySnapshot | null = null;
  if (args.bounty !== undefined) {
    bounty = parseSnapshotBounty(args.bounty);
    if (!bounty) return null;
  }

  const restored = migrate(raw, newUid);
  const clearedNamed = bounty
    ? bounty.clears.filter(c => c.kind === 'named' && bountyById(c.questId)?.difficulty === 'named').map(c => c.questId)
    : restored.clearedNamed.filter(id => bountyById(id)?.difficulty === 'named');
  return { ...restored, clearedNamed };
}

/** bounty.resetToday의 kind 인자를 검증·정규화한다 */
export function parseBountyResetKind(args: Record<string, unknown>): BountyResetKind | null {
  const kind = args.kind;
  if (kind === undefined || kind === 'all') return 'all';
  if (kind === 'general' || kind === 'named') return kind;
  return null;
}

/** 명령 하나를 적용한다. 모르는 명령·잘못된 인자는 null(= bad-request) */
export function reduceDebug(
  state: GameState,
  command: string,
  args: Record<string, unknown>,
  today: string,
  now: string = new Date().toISOString(),
  newUid: () => string = () => crypto.randomUUID(),
): GameState | null {
  if (isDebugTableCommand(command)) {
    if (command === 'bounty.resetToday' && parseBountyResetKind(args) === null) return null;
    return state;
  }
  switch (command) {
    case 'stats.set':
      return setStats(state, args);
    case 'dex.completeZone': {
      const zone = zoneArg(args);
      return zone ? completeZoneDex(state, zone, today) : null;
    }
    case 'dex.fill':
      return fillDex(state, args, today);
    case 'dex.reset':
      return resetDex(state, args);
    case 'named.unlock':
      return setNamed(state, args, true, today);
    case 'named.reset':
      return setNamed(state, args, false, today);
    case 'items.grant':
      return grantItems(state, args);
    case 'cooking.finish':
      return finishCooking(state, now);
    case 'artifact.set':
      return setArtifact(state, args);
    case 'hat.set':
      return setHat(state, args);
    case 'achievement.setCounter':
      return setAchievementCounter(state, args);
    case 'achievement.resetCounters':
      return resetAchievementCounters(state, args);
    case 'achievement.evaluate':
      return evaluateDebugAchievements(state, args);
    case 'bag.spawn':
      return spawnBagFish(state, args, now, newUid);
    case 'bounty.grantMaterial': {
      const art = typeof args.artifact === 'string' ? artifactById(args.artifact) : undefined;
      const count = args.count === undefined ? 1 : args.count; // 개수를 주지 않으면 1개
      if (!art || typeof count !== 'number' || !Number.isInteger(count) || count <= 0) return null;
      return addItem(state, art.materialId, count);
    }
    case 'snapshot.restore':
      return restoreSnapshot(args, newUid);
    default:
      return null;
  }
}
