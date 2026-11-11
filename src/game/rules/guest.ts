// 게스트(계정을 연결하지 않은 익명 계정)가 할 수 있는 액션의 판정.
// 게스트는 마을 안의 이동, 낚시, 판매, 낚싯대 강화, 배 구매만 한다. 서버가 이 판정으로 그 밖의 액션을 거부한다.
// 거부 사유는 코드로 돌려준다. 화면은 코드로 안내를 고른다.
import type { GameAction } from './actions.js';
import { spotById } from '../content/spots.js';

/**
 * ok: 통과.
 * guest-village-only: 마을 밖으로 나가는 이동이나 마을 밖 낚시. 화면은 계정 연결을 안내한다.
 * account-only: 게스트에게 열리지 않은 기능.
 */
export type GuestVerdict = 'ok' | 'account-only' | 'guest-village-only';

// 조건 없이 통과하는 액션. 접속 기록(boot)은 게임에 들어오는 데 필요하고, 튜토리얼 기록과 잠금은 낚시와 판매 흐름의 일부다
const OPEN = new Set<GameAction['type']>(['boot', 'sell', 'upgradeRod', 'buyBoat', 'seeTutorial', 'setLocked', 'autoLock']);
// 개발 명령과 이사 코드는 서버의 환경과 소유자 판정이 따로 정한다
const GATED_ELSEWHERE = new Set<GameAction['type']>(['debug', 'import']);

/** 마을 안에서 닿는 곳: 마을 지역과 집 */
const inVillage = (to: unknown): boolean => {
  const t = to as { kind?: unknown; id?: unknown } | null | undefined;
  return (t?.kind === 'region' && t.id === 'village') || (t?.kind === 'base' && t.id === 'home');
};

export function guestActionVerdict(action: GameAction): GuestVerdict {
  if (OPEN.has(action.type) || GATED_ELSEWHERE.has(action.type)) return 'ok';
  if (action.type === 'travel') return inVillage(action.to) ? 'ok' : 'guest-village-only';
  if (action.type === 'catch') return spotById(action.spot)?.region === 'village' ? 'ok' : 'guest-village-only';
  return 'account-only';
}
