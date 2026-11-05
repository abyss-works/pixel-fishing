import { useEffect, useSyncExternalStore } from 'react';
import { openLive } from '../../../platform/api';
import type { LiveConnection } from '../../../platform/api';
import type { ServerMessage } from '../../../game/rules/live';
import { followTarget, LIVE_MOVE_MS } from '../../../game/rules/live';
import { useSession } from '../../account/service/session';
import { applyLiveMessage, EMPTY_LIVE, isStale, nextPositionMessage, othersInRegion } from '../model/live';
import type { LiveState, MyPosition, SentPosition } from '../model/live';

// 실시간 채널 연결과 다른 플레이어 상태 — 게임 화면이 떠 있는 동안 연결을 유지한다.
// 연결은 로그인 쿠키로 인증되므로 세션이 선 뒤 열고, 계정이 바뀌면 새 쿠키로 다시 연다.
// 상태는 모듈 하나에만 있다(창 하나에 연결 하나). 화면 구독은 접속·퇴장·바다 이동 때만 알린다.

let state: LiveState = EMPTY_LIVE;
let conn: LiveConnection | null = null;
/** hello를 받을 때마다 늘어난다 — 재연결 뒤 내 위치를 다시 보내는 기준 */
let helloCount = 0;
const listeners = new Set<() => void>();
/** 화면에 그리는 위치 — 받은 좌표를 향해 프레임마다 다가간다 */
const drawn = new Map<string, { x: number; y: number }>();
let lastFrame = 0;

function receive(msg: ServerMessage): void {
  const prev = state;
  state = applyLiveMessage(state, msg, Date.now());
  if (msg.t === 'hello') { helloCount++; drawn.clear(); }
  if (msg.t === 'leave') drawn.delete(msg.uid);
  const regionChanged = msg.t === 'move' && prev.others[msg.uid]?.presence.region !== msg.region;
  if (msg.t === 'hello' || msg.t === 'join' || msg.t === 'leave' || regionChanged) {
    for (const listener of listeners) listener();
  }
}

function reset(): void {
  state = EMPTY_LIVE;
  drawn.clear();
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getState = () => state;

/** 실시간 채널 연결을 게임 화면 수명에 묶는다 */
export function useLive(): void {
  const { ready, uid } = useSession();
  useEffect(() => {
    if (!ready || !uid) return;
    conn = openLive(receive);
    return () => { conn?.close(); conn = null; reset(); };
  }, [ready, uid]);
}

/** 그 바다에 있는 다른 플레이어의 이름 목록 */
export function usePlayersIn(region: string): string[] {
  const s = useSyncExternalStore(subscribe, getState, getState);
  return othersInRegion(s, region).map(o => o.presence.nick);
}

/** 프레임마다 부른다 — 그 바다의 다른 플레이어를 보간한 위치로 돌려준다 */
export function othersFrame(region: string, now: number): { x: number; y: number; nick: string; line: boolean; stale: boolean }[] {
  const dt = lastFrame ? now - lastFrame : 0;
  lastFrame = now;
  const wall = Date.now();
  return othersInRegion(state, region).map(o => {
    const { uid, x, y, nick, line } = o.presence;
    const pos = followTarget(drawn.get(uid) ?? { x, y }, { x, y }, dt);
    drawn.set(uid, pos);
    return { x: pos.x, y: pos.y, nick, line, stale: isStale(o, wall) };
  });
}

/**
 * 내 위치를 송신 주기마다 보낸다. 탭이 숨겨져 있으면 보내지 않고, 다시 보이거나 재연결되면 현재 위치를 다시 보낸다.
 * @param read 지금 위치와 낚싯줄 상태
 */
export function useLivePosition(read: () => MyPosition): void {
  useEffect(() => {
    let last: SentPosition | null = null;
    let seenHello = helloCount;
    const timer = setInterval(() => {
      if (!conn) return;
      if (document.hidden || seenHello !== helloCount) { last = null; seenHello = helloCount; if (document.hidden) return; }
      const next = nextPositionMessage(last, read());
      last = next.sent;
      if (next.msg) conn.send(next.msg);
    }, LIVE_MOVE_MS);
    return () => clearInterval(timer);
  }, [read]);
}
