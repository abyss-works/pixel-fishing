// 개발 도구 서버 명령 — debug 액션의 리듀서 몫(서버·로컬 게이트웨이 공유).
// 새 규칙·수치를 두지 않는다. 각 명령은 기존 규칙 함수(도감 판정·지원 코드 지급·아이템 지급)를
// 엮는 얇은 어댑터다. 전용 테이블(수주·진행·도전권)을 바꾸는 명령은 상태를 그대로 두고,
// 서버가 감사 이벤트를 보고 행을 쓴다. 허용 판정(운영 차단)은 서버 몫이다.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import {
  applyRelief, LICENSE_GRADES, MAX_BOAT, addItem, nextDexRec, zoneDexMissing,
} from './logic.js';
import type { GameState } from './logic.js';
import { BOUNTY_LICENSE_FAME } from '../content/bounties.js';
import type { BountyZone } from '../content/bounties.js';
import { artifactOfZone } from '../content/artifacts.js';

/** 상태를 바꾸는 명령 */
const STATE_COMMANDS = ['stats.set', 'dex.completeZone', 'bounty.grantMaterial'] as const;
/** 전용 테이블만 바꾸는 명령 — 리듀서는 상태를 그대로 둔다 */
export const DEBUG_TABLE_COMMANDS = [
  'bounty.expireTickets', 'bounty.clearTickets', 'bounty.resetToday', 'bounty.clearProgress',
] as const;

export type DebugCommandId = typeof STATE_COMMANDS[number] | typeof DEBUG_TABLE_COMMANDS[number];
export type DebugTableCommand = typeof DEBUG_TABLE_COMMANDS[number];
export const DEBUG_COMMAND_IDS: readonly DebugCommandId[] = [...STATE_COMMANDS, ...DEBUG_TABLE_COMMANDS];

export const isDebugTableCommand = (command: string): command is DebugTableCommand =>
  (DEBUG_TABLE_COMMANDS as readonly string[]).includes(command);

/** 수배 구역 목록 — 라이선스 명성 표가 정본이다 */
export const DEBUG_ZONES = Object.keys(BOUNTY_LICENSE_FAME) as BountyZone[];

const zoneArg = (args: Record<string, unknown>): BountyZone | null =>
  DEBUG_ZONES.includes(args.zone as BountyZone) ? args.zone as BountyZone : null;

/** stats.set 인자 — 준 값만 바꾼다. 음수·비정수 낚싯대·범위 밖 배는 거부 */
function setStats(state: GameState, args: Record<string, unknown>): GameState | null {
  const keys = ['gold', 'fame', 'rod', 'boat'] as const;
  const next: Partial<Record<typeof keys[number], number>> = {};
  for (const key of keys) {
    const v = args[key];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
    next[key] = v;
  }
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

/** 명령 하나를 적용한다. 모르는 명령·잘못된 인자는 null(= bad-request) */
export function reduceDebug(
  state: GameState, command: string, args: Record<string, unknown>, today: string,
): GameState | null {
  if (isDebugTableCommand(command)) return state;
  switch (command) {
    case 'stats.set':
      return setStats(state, args);
    case 'dex.completeZone': {
      const zone = zoneArg(args);
      return zone ? completeZoneDex(state, zone, today) : null;
    }
    case 'bounty.grantMaterial': {
      const zone = zoneArg(args);
      const art = zone ? artifactOfZone(zone) : undefined;
      return art ? addItem(state, art.materialId, 1) : null;
    }
    default:
      return null;
  }
}
