// 실시간 채널 접속 상태 조회와 개인 알림 — 같은 프로세스의 WebSocket 허브가 기동할 때 함수를 등록한다.
// 서버 함수(친구 목록, 관리자 접속 목록 등)는 허브를 직접 알지 않고 이 함수만 쓴다. 등록 전(시험, 허브 없음)에는 모두 미접속이고 알림은 버린다.
import type { FormId } from '../../src/game/content/fish.js';
import type { Presence, ServerMessage } from '../../src/game/rules/live.js';
import type { LiveOnline } from './live.js';

export type CatchFxPayload = { fishId: string; form?: FormId };

let lookup: (uid: string) => Presence | null | Promise<Presence | null> = () => null;
let onlineCheck: (uid: string) => boolean | Promise<boolean> = () => false;
let list: () => LiveOnline[] | Promise<LiveOnline[]> = () => [];
let notify: (uid: string, msg: ServerMessage) => void = () => {};
let nickUpdater: (uid: string, nick: string) => void = () => {};
let fameUpdater: (uid: string, fame: number) => void = () => {};
let catchFxBroadcaster: (uid: string, payload: CatchFxPayload) => void = () => {};
let guildNotify: (guildId: string, msg: ServerMessage) => void = () => {};
let allNotify: (msg: ServerMessage) => void = () => {};

export function providePresence(fn: (uid: string) => Presence | null | Promise<Presence | null>): void {
  lookup = fn;
}

/** 그 사용자의 접속 상태. 연결돼 있지 않거나 아직 위치를 보내지 않았으면 null */
export async function presenceOf(uid: string): Promise<Presence | null> {
  return await lookup(uid);
}

export function provideIsUserOnline(fn: (uid: string) => boolean | Promise<boolean>): void {
  onlineCheck = fn;
}

/** 대상 사용자가 현재 실시간 WebSocket 채널에 연결되어 있는지 확인한다 */
export async function isUserOnline(uid: string): Promise<boolean> {
  return await onlineCheck(uid);
}

export function provideOnline(fn: () => LiveOnline[] | Promise<LiveOnline[]>): void {
  list = fn;
}

/** 지금 연결된 사용자 전부 */
export async function onlineUsers(): Promise<LiveOnline[]> {
  return await list();
}

export function provideNotify(fn: (uid: string, msg: ServerMessage) => void): void {
  notify = fn;
}

/** 그 사용자의 연결(창 하나)에 메시지를 보낸다. 연결돼 있지 않으면 버린다 */
export function notifyUser(uid: string, msg: ServerMessage): void {
  notify(uid, msg);
}

export function provideNotifyGuild(fn: (guildId: string, msg: ServerMessage) => void): void {
  guildNotify = fn;
}

/** 그 길드에 속한 접속자 모두에게 메시지를 보낸다. 접속한 길드원이 없으면 버린다 */
export function notifyGuild(guildId: string, msg: ServerMessage): void {
  guildNotify(guildId, msg);
}

export function provideNotifyAll(fn: (msg: ServerMessage) => void): void {
  allNotify = fn;
}

/** 게스트를 포함한 모든 활성 실시간 연결에 메시지를 보낸다 */
export function notifyAll(msg: ServerMessage): void {
  allNotify(msg);
}

export function provideSetNick(fn: (uid: string, nick: string) => void): void {
  nickUpdater = fn;
}

/** 활성 실시간 연결의 닉네임을 즉시 갱신하고 다른 접속자에게 알린다 */
export function setNick(uid: string, nick: string): void {
  nickUpdater(uid, nick);
}

export function provideSetFame(fn: (uid: string, fame: number) => void): void {
  fameUpdater = fn;
}

/** 활성 실시간 연결의 명성을 즉시 갱신한다 */
export function setFame(uid: string, fame: number): void {
  fameUpdater(uid, fame);
}

export function provideBroadcastCatchFx(fn: (uid: string, payload: CatchFxPayload) => void): void {
  catchFxBroadcaster = fn;
}

/** 서버가 확정한 어획 점프 연출을 같은 지역 접속자에게 전파한다 */
export function broadcastCatchFx(uid: string, payload: CatchFxPayload): void {
  catchFxBroadcaster(uid, payload);
}
