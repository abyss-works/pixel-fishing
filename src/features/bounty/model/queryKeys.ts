import { kstDay } from '../../../platform/api';

// KST 날짜가 바뀌면 의뢰 스냅샷 캐시도 다음 키로 분리한다.
export const bountyKey = (): readonly [string, string] => ['bounty', kstDay()];
