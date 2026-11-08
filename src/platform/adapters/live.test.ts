import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLive, liveUrl, LIVE_RETRY_MAX_MS, LIVE_RETRY_MIN_MS } from './live';
import { LIVE_CLOSE_OUTDATED, LIVE_CLOSE_REPLACED, LIVE_PING_MS } from '../../game/rules/live';
import { BUILD_ID } from '../../buildId';
import { APP_VERSION } from '../../version';
import { subscribeFailure } from '../../core/errors';
import type { AppError } from '../../core/errors';

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor() { FakeSocket.all.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  // 서버 쪽 사건
  accept() { this.readyState = 1; this.onopen?.(); }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1];
const connect = (onMessage = vi.fn()) =>
  connectLive(onMessage, FakeSocket as unknown as new (url: string) => WebSocket, 'ws://test/api/live');

beforeEach(() => { vi.useFakeTimers(); FakeSocket.all = []; });
afterEach(() => { vi.useRealTimers(); });

describe('connectLive', () => {
  it('서버 메시지를 넘기고 깨진 메시지는 버린다', () => {
    const onMessage = vi.fn();
    connect(onMessage);
    last().accept();
    last().onmessage?.({ data: '{"t":"leave","uid":"u2"}' });
    last().onmessage?.({ data: 'not json' });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ t: 'leave', uid: 'u2' });
  });

  it('연결된 동안 접속 확인을 주기마다 보낸다', () => {
    connect();
    last().accept();
    vi.advanceTimersByTime(LIVE_PING_MS * 2);
    expect(last().sent).toEqual(['{"t":"ping"}', '{"t":"ping"}']);
  });

  it('끊기면 대기 시간을 두 배씩 늘려 상한까지 다시 연결하고, 연결되면 처음 값으로 돌아간다', () => {
    connect();
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      last().drop();
      const before = FakeSocket.all.length;
      let waited = 0;
      while (FakeSocket.all.length === before) { vi.advanceTimersByTime(100); waited += 100; }
      waits.push(waited);
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, LIVE_RETRY_MAX_MS, LIVE_RETRY_MAX_MS]);
    last().accept();
    last().drop();
    vi.advanceTimersByTime(LIVE_RETRY_MIN_MS);
    expect(FakeSocket.all).toHaveLength(9);
  });

  it('다른 창에 연결을 넘겼거나 직접 닫으면 다시 연결하지 않는다', () => {
    connect();
    last().drop(LIVE_CLOSE_REPLACED);
    const conn = connect();
    conn.close();
    vi.advanceTimersByTime(LIVE_RETRY_MAX_MS * 2);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('연결 주소에 빌드 식별자와 릴리즈 버전을 싣는다', () => {
    const url = new URL(liveUrl());
    expect(url.pathname).toBe('/api/live');
    expect(url.searchParams.get('build')).toBe(BUILD_ID);
    expect(url.searchParams.get('version')).toBe(APP_VERSION);
  });

  it('서버가 낡은 빌드로 닫으면 다시 연결하지 않고 HTTP 426과 같은 새로고침 안내를 띄운다', () => {
    const failures: AppError[] = [];
    const off = subscribeFailure(e => failures.push(e));
    connect();
    last().drop(LIVE_CLOSE_OUTDATED);
    vi.advanceTimersByTime(LIVE_RETRY_MAX_MS * 2);
    off();
    expect(FakeSocket.all).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].kind).toBe('outdated');
  });

  it('send는 연결돼 있을 때만 보낸다', () => {
    const conn = connect();
    conn.send({ t: 'stop' });
    expect(last().sent).toEqual([]);
    last().accept();
    conn.send({ t: 'stop' });
    expect(last().sent).toEqual(['{"t":"stop"}']);
  });
});
