import { kstDay } from './bounty';

// 조회 키 단일 근원 — views는 키를 만들지 않고 이 팩토리만 쓴다.
// 날짜를 키에 넣어 KST 자정 경계를 선언적으로 분리한다 (타이머 불필요).
// 모듈 상수가 아니라 함수다 — 자정을 넘겨도 호출 시점 날짜로 만든다.
export const bountyKey = (): readonly [string, string] => ['bounty', kstDay()];
