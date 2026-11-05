// 실시간 채널 접속 상태 조회와 개인 알림 — 같은 프로세스의 WebSocket 허브가 기동할 때 함수를 등록한다.
// 서버 함수(친구 목록, 관리자 접속 목록 등)는 허브를 직접 알지 않고 이 함수만 쓴다. 등록 전(시험, 허브 없음)에는 모두 미접속이고 알림은 버린다.
import type { Presence, ServerMessage } from '../../src/game/rules/live.js';
import type { LiveOnline } from './live.js';

let lookup: (uid: string) => Presence | null = () => null;
let list: () => LiveOnline[] = () => [];
let notify: (uid: string, msg: ServerMessage) => void = () => {};

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

export function provideNotify(fn: (uid: string, msg: ServerMessage) => void): void {
  notify = fn;
}

/** 그 사용자의 연결(창 하나)에 메시지를 보낸다. 연결돼 있지 않으면 버린다 */
export function notifyUser(uid: string, msg: ServerMessage): void {
  notify(uid, msg);
}
