import { kstDay } from '../../../platform/api';
export { kstDay };

// 계정(uid)이나 KST 날짜가 바뀌면 의뢰 스냅샷 캐시도 다음 키로 분리한다.
export const bountyKey = (uid: string | null): readonly [string, string | null, string] =>
  ['bounty', uid, kstDay()];
