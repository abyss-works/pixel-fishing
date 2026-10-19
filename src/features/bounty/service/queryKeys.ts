import { gameDay } from '../../../platform/api';
export { gameDay };

// 계정(uid)이나 게임 날짜(KST 04:00 경계)가 바뀌면 의뢰 스냅샷 캐시도 다음 키로 분리한다.
export const bountyKey = (uid: string | null): readonly [string, string | null, string] =>
  ['bounty', uid, gameDay()];
