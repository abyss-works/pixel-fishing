// 실시간 채널 메시지 형식 — 게임 서버와 브라우저가 같은 정의를 쓴다.
// 실시간 채널은 표시용이다. 게임 상태는 액션 경로만 바꾼다.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.

import { safeLook } from '../content/wardrobe.js';
import type { Look } from '../content/wardrobe.js';

export type Dir = 0 | 1 | 2 | 3;
/** 찌가 떠 있는 자리(어군 위치) — 낚싯줄을 드리웠을 때만 보낸다 */
export interface Bob { x: number; y: number }

export type ClientMessage =
  | { t: 'move'; region: string; zone?: string | null; x: number; y: number; dir: Dir; line: boolean; bob?: Bob; look?: Look; idleMs?: number } // region: 지금 있는 지역, zone: 지금 있는 해역, line: 낚싯줄을 드리운 상태, bob: 찌 위치, look: 외형(처음과 바뀐 때만), idleMs: 이번 던짐의 첫 결과가 나온 뒤 지난 시간(첫 결과 뒤에만)
  | { t: 'stop' }
  | { t: 'chat'; text: string; room?: 'guild' } // room이 없으면 월드 채팅, guild면 내 길드 채팅
  | { t: 'typing'; on: boolean } // 채팅 입력 중 표시 켜기·끄기
  | { t: 'ping' };

export interface Presence { uid: string; nick: string; boat: number; region: string; zone?: string | null; x: number; y: number; dir: Dir; line: boolean; bob?: Bob; look?: Look; idleMs?: number } // idleMs: 낚시 중인 사람의 첫 결과 뒤 지난 시간(서버가 보내는 시점 기준, 선택 필드. 없으면 세지 않는다)
export interface ChatLine { id: number; uid: string; nick: string; text: string; at: string }

export type ServerMessage =
  | { t: 'hello'; you: string; others: Presence[]; recentChat: ChatLine[]; recentGuildChat?: ChatLine[] } // recentGuildChat: 길드원일 때만
  | { t: 'move'; uid: string; region: string; zone?: string | null; x: number; y: number; dir: Dir; line: boolean; bob?: Bob; look?: Look; idleMs?: number }
  | { t: 'stop'; uid: string }
  | { t: 'join'; presence: Presence }
  | { t: 'leave'; uid: string }
  | { t: 'chat'; line: ChatLine; room?: 'guild' } // 길드 채팅은 그 길드의 접속한 길드원에게만 간다
  | { t: 'typing'; uid: string; on: boolean }
  | { t: 'friend'; kind: 'request' | 'accepted'; uid: string; nick: string | null } // 받은 친구 요청·내 요청의 수락. 그 사람에게만 간다
  // 길드 가입 신청의 도착(길드장에게, nick은 신청한 사람)과 처리 결과(신청한 사람에게). 그 사람에게만 간다
  | { t: 'guild'; kind: 'request' | 'approved' | 'rejected'; guild: string; nick: string | null }
  | { t: 'error'; code: 'chat-guest' | 'chat-rate' | 'chat-length' | 'chat-restricted' | 'chat-no-guild' };

/** WebSocket 경로. 게임 서버와 같은 오리진이다 */
export const LIVE_PATH = '/api/live';
/** 클라이언트가 접속 확인(ping)을 보내는 주기 */
export const LIVE_PING_MS = 30_000;
/** 이 시간 동안 받은 메시지가 없으면 서버가 연결을 끊는다 */
export const LIVE_IDLE_MS = 90_000;
/** 연결 하나가 1초에 보낼 수 있는 메시지 수. 넘으면 서버가 연결을 끊는다 */
export const LIVE_MAX_PER_SEC = 15;
/** 메시지 원문 하나의 최대 길이(문자 수). 채팅 100자를 담고도 남는다 */
export const LIVE_MAX_LENGTH = 1024;
/** 서버 재시작으로 닫는 연결의 종료 코드(RFC 6455 1012). 클라이언트는 다시 연결한다 */
export const LIVE_CLOSE_RESTART = 1012;
/** 같은 계정의 새 연결이 들어와 이전 연결을 닫는 종료 코드. 닫힌 쪽은 다시 연결하지 않는다 */
export const LIVE_CLOSE_REPLACED = 4000;
/** 클라이언트 빌드가 서버와 달라 연결을 받지 않고 닫는 종료 코드. 닫힌 쪽은 다시 연결하지 않고 새로고침을 안내한다 */
export const LIVE_CLOSE_OUTDATED = 4001;

const isCoord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBob = (v: unknown): v is Bob =>
  typeof v === 'object' && v !== null && isCoord((v as Record<string, unknown>).x) && isCoord((v as Record<string, unknown>).y);
const isDir = (v: unknown): v is Dir => v === 0 || v === 1 || v === 2 || v === 3;
const isRegion = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,32}$/.test(v);

/**
 * 클라이언트 메시지 원문을 검사한다. 서버가 신뢰 경계에서 쓴다.
 * @returns 형식에 맞으면 필요한 필드만 담은 메시지, 아니면 null
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > LIVE_MAX_LENGTH) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'move':
      if (!isRegion(o.region) || !isCoord(o.x) || !isCoord(o.y) || !isDir(o.dir) || typeof o.line !== 'boolean') return null;
      if (o.zone !== undefined && o.zone !== null && !isRegion(o.zone)) return null;
      if (o.bob !== undefined && o.bob !== null && !isBob(o.bob)) return null;
      if (o.idleMs !== undefined && !(isCoord(o.idleMs) && o.idleMs >= 0)) return null;
      return {
        t: 'move', region: o.region, ...(o.zone !== undefined ? { zone: o.zone } : {}), x: o.x, y: o.y, dir: o.dir, line: o.line,
        ...(isBob(o.bob) ? { bob: { x: o.bob.x, y: o.bob.y } } : {}),
        // 외형은 범위를 검사하고, 맞지 않으면 기본 외형으로 바꿔 전한다
        ...(o.look !== undefined ? { look: safeLook(o.look) } : {}),
        ...(o.idleMs !== undefined ? { idleMs: o.idleMs } : {}),
      };
    case 'stop': return { t: 'stop' };
    case 'ping': return { t: 'ping' };
    case 'chat':
      if (typeof o.text !== 'string' || (o.room !== undefined && o.room !== 'guild')) return null;
      return o.room === 'guild' ? { t: 'chat', text: o.text, room: 'guild' } : { t: 'chat', text: o.text };
    case 'typing': return typeof o.on === 'boolean' ? { t: 'typing', on: o.on } : null;
    default: return null;
  }
}

/** 채팅 한 메시지의 최대 길이(문자 수, 앞뒤 공백을 지운 뒤) */
export const CHAT_MAX_LENGTH = 100;
/** 채팅 도배 판정의 슬라이딩 윈도우 길이 */
export const CHAT_RATE_WINDOW_MS = 10_000;
/** 슬라이딩 윈도우 안에서 계정 하나가 보낼 수 있는 메시지 수 */
export const CHAT_RATE_MAX = 25;
/** 연결 직후 hello에 싣는 최근 대화 수 */
export const CHAT_RECENT = 50;

/** 보낼 채팅 본문. 앞뒤 공백을 지운 뒤 1~100자가 아니면 null이다 */
export function chatText(raw: string): string | null {
  const text = raw.trim();
  const length = [...text].length;
  return length >= 1 && length <= CHAT_MAX_LENGTH ? text : null;
}

/**
 * 슬라이딩 윈도우 도배 판정. 최근 10초 안에 보낸 메시지가 25개면 거부한다.
 * @param sentAt 지금까지 보낸 시각(오름차순)
 * @returns 보낼 수 있는지와, 창 안의 기록만 남긴 다음 기록(허용이면 now를 더한다)
 */
export function chatRate(sentAt: readonly number[], now: number): { ok: boolean; window: number[] } {
  const window = sentAt.filter(t => now - t < CHAT_RATE_WINDOW_MS);
  if (window.length >= CHAT_RATE_MAX) return { ok: false, window };
  return { ok: true, window: [...window, now] };
}

/** 이동 중 위치 송신 주기(10Hz). 받는 쪽은 이 주기 동안 직전 위치에서 새 위치까지 일정 속도로 옮긴다 */
export const LIVE_MOVE_MS = 100;
/** 이동 중인 플레이어에게서 이 시간 동안 받은 것이 없으면 반투명으로 그린다 */
export const LIVE_STALE_MS = 3000;
// 이보다 먼 목표는 미끄러지지 않고 바로 옮긴다(지역 이동·재접속)
const SNAP_DISTANCE = 160;

/** 다른 플레이어의 화면 이동 — at부터 송신 주기 동안 from에서 to로 간다 */
export interface Glide { from: { x: number; y: number }; to: { x: number; y: number }; at: number }

/** 지금 그릴 위치. 송신 주기가 지나면 목표에 머문다 */
export function glidePosition(g: Glide, now: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, (now - g.at) / LIVE_MOVE_MS));
  return { x: g.from.x + (g.to.x - g.from.x) * t, y: g.from.y + (g.to.y - g.from.y) * t };
}

/**
 * 새 좌표를 받았을 때의 다음 이동. 지금 그리던 위치에서 출발해 일정 속도로 간다.
 * 처음 받았거나 멀리 떨어진 목표는 바로 옮긴다.
 */
export function nextGlide(prev: Glide | null, to: { x: number; y: number }, now: number): Glide {
  const target = { x: to.x, y: to.y };
  if (!prev) return { from: target, to: target, at: now };
  const from = glidePosition(prev, now);
  if (Math.hypot(target.x - from.x, target.y - from.y) > SNAP_DISTANCE) return { from: target, to: target, at: now };
  return { from, to: target, at: now };
}

/** 방치 시간 판정에 쓰는 위치 */
export interface Spot { region: string; x: number; y: number }

/**
 * 방치 시간을 세기 시작한 시각. 낚싯줄이 없으면 null이다. 줄이 있고 같은 자리에서 이어지면 이전 시작 시각을 유지한다.
 * 처음이거나 지역·좌표가 바뀌었으면 보고받은 첫 결과 경과(reportedMs)를 지금에서 뺀 시각이고, 보고가 없으면 null이다.
 * @param prev 이전에 본 위치와 시작 시각(없으면 null)
 * @param reportedMs 그 던짐의 첫 결과가 나온 뒤 지난 시간(클라이언트가 move에 싣는 선택 필드)
 */
export function idleSinceOf(
  prev: { spot: Spot; since: number | null } | null, next: Spot, line: boolean, reportedMs: number | undefined, now: number,
): number | null {
  if (!line) return null;
  const same = prev && prev.spot.region === next.region && prev.spot.x === next.x && prev.spot.y === next.y;
  return (same ? prev.since : null) ?? (reportedMs === undefined ? null : now - reportedMs);
}

/** 방치 시간 표시. 1시간 미만은 `mm:ss`, 1시간 이상은 `h:mm:ss`다 */
export function formatIdle(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
