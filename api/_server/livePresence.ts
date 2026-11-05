// 실시간 채널 접속 상태 조회 — 같은 프로세스의 WebSocket 허브가 기동할 때 조회 함수를 등록한다.
// 서버 함수(친구 목록, 관리자 접속 목록 등)는 허브를 직접 알지 않고 이 조회만 쓴다. 등록 전(시험, 허브 없음)에는 모두 미접속이다.
import type { Presence } from '../../src/game/rules/live.js';
import type { LiveOnline } from './live.js';

let lookup: (uid: string) => Presence | null = () => null;
let list: () => LiveOnline[] = () => [];

export function providePresence(fn: (uid: string) => Presence | null): void {
  lookup = fn;
}

/** 그 사용자의 접속 상태. 연결돼 있지 않거나 아직 위치를 보내지 않았으면 null */
export function presenceOf(uid: string): Presence | null {
  return lookup(uid);
}

export function provideOnline(fn: () => LiveOnline[]): void {
  list = fn;
}

/** 지금 연결된 사용자 전부 */
export function onlineUsers(): LiveOnline[] {
  return list();
}
