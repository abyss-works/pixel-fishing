// 데스크톱 위젯 SSE 허브 단위 테스트 — 헤더·초기 주석·keepalive·연결 상한 축출·단조 이벤트 ID·강제 종료·SIGTERM 정리를 검증한다.
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WIDGET_SSE_KEEPALIVE_MS } from '../../src/game/rules/widget.js';
import type { WidgetSummary } from '../../src/game/rules/widget.js';
import {
  WIDGET_MAX_CONNECTIONS_PER_USER,
  createWidgetHub,
  provideWidgetHub,
  widgetHub,
} from './widgetHub.js';
import type { WidgetSseRes } from './widgetHub.js';

function mockSseRes() {
  const emitter = new EventEmitter();
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let flushCount = 0;
  const res: WidgetSseRes = Object.assign(emitter, {
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
      return res;
    },
    flushHeaders() {
      flushCount += 1;
    },
    write(chunk: string | Uint8Array) {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    },
    end() {
      res.writableEnded = true;
      emitter.emit('close');
      return res;
    },
  });
  return {
    res,
    headers,
    chunks,
    flushCount: () => flushCount,
    emitClose: () => {
      res.writableEnded = true;
      emitter.emit('close');
    },
  };
}

const SAMPLE_SUMMARY: WidgetSummary = {
  authState: 'authenticated',
  connectionState: 'connected',
  fishingState: 'active',
  spotId: 'deep',
  spotName: '마리아나 해구',
  seaTheme: 'deep',
  bag: { count: 12, cap: 300, percent: 4 },
  recentCatches: [],
  serverTimeMs: 1_700_000_000_000,
  lastCatchAtMs: 1_699_999_990_000,
  gameHour: 12.5,
  lastEventId: '42',
};

afterEach(() => {
  vi.useRealTimers();
  provideWidgetHub(createWidgetHub());
});

describe('widgetHub', () => {
  it('연결 시 SSE 헤더·flush·초기 주석 프레임을 즉시 전송하고 keepalive를 유지한다', () => {
    vi.useFakeTimers();
    const hub = createWidgetHub({ now: () => 1_700_000_000_000 });
    const mock = mockSseRes();

    const client = hub.addClient('user-1', mock.res);
    expect(mock.res.statusCode).toBe(200);
    expect(mock.headers).toEqual({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    });
    expect(mock.flushCount()).toBe(1);
    expect(mock.chunks).toEqual([': connected\n\n']);
    expect(hub.hasSubscribers('user-1')).toBe(true);
    expect(hub.subscriberCount('user-1')).toBe(1);

    hub.sendSummarySync(client, SAMPLE_SUMMARY);
    expect(mock.chunks[1]).toBe(
      `id: 42\nevent: summary_sync\ndata: ${JSON.stringify(SAMPLE_SUMMARY)}\n\n`,
    );

    vi.advanceTimersByTime(WIDGET_SSE_KEEPALIVE_MS);
    expect(mock.chunks[2]).toBe(': keepalive\n\n');

    mock.emitClose();
    expect(hub.hasSubscribers('user-1')).toBe(false);
    expect(hub.subscriberCount('user-1')).toBe(0);

    vi.advanceTimersByTime(WIDGET_SSE_KEEPALIVE_MS * 2);
    expect(mock.chunks).toHaveLength(3);
  });

  it('사용자당 연결 수가 5개를 넘으면 가장 오래된 연결을 정리·종료한다', () => {
    const hub = createWidgetHub();
    const mocks = Array.from({ length: WIDGET_MAX_CONNECTIONS_PER_USER + 1 }, () => mockSseRes());

    for (const mock of mocks) {
      hub.addClient('user-1', mock.res);
    }

    expect(hub.subscriberCount('user-1')).toBe(WIDGET_MAX_CONNECTIONS_PER_USER);
    expect(mocks[0].res.writableEnded).toBe(true);
    for (let i = 1; i < mocks.length; i += 1) {
      expect(mocks[i].res.writableEnded).toBe(false);
    }
    hub.close();
  });

  it('maxPerUser가 1일 때 기존 연결을 축출해도 새 연결이 구독자 맵에 남아 이벤트를 받는다', () => {
    const hub = createWidgetHub({ maxPerUser: 1 });
    const first = mockSseRes();
    const second = mockSseRes();

    hub.addClient('user-1', first.res);
    hub.addClient('user-1', second.res);

    expect(first.res.writableEnded).toBe(true);
    expect(second.res.writableEnded).toBe(false);
    expect(hub.hasSubscribers('user-1')).toBe(true);
    expect(hub.subscriberCount('user-1')).toBe(1);

    const statusId = hub.publishStatusChanged('user-1', 'idle');
    expect(statusId).not.toBeNull();
    expect(second.chunks[1]).toContain('event: status_changed');

    hub.disconnectUser('user-1');
    expect(second.res.writableEnded).toBe(true);
    expect(hub.hasSubscribers('user-1')).toBe(false);
    hub.close();
  });

  it('단조 증가 이벤트 ID와 표준 SSE 프레임을 생성한다(catch, bag_sync, spot_changed, status_changed)', () => {
    let clock = 1_700_000_000_000;
    const hub = createWidgetHub({ now: () => clock });
    const mock = mockSseRes();
    hub.addClient('user-1', mock.res);

    expect(hub.publishCatch('missing-user', {
      catchItem: {
        eventId: 'c1',
        spriteKey: 'crucian',
        name: '붕어',
        rarity: 'common',
        sizeText: '20cm',
        priceText: '10G',
        isBig: false,
        isMutant: false,
        caughtAtMs: clock,
      },
      bag: { count: 1, cap: 60, percent: 1 },
    })).toBeNull();

    const catchId = hub.publishCatch('user-1', {
      catchItem: {
        eventId: 'c1',
        spriteKey: 'crucian',
        name: '붕어',
        rarity: 'common',
        sizeText: '20cm',
        priceText: '10G',
        isBig: false,
        isMutant: false,
        caughtAtMs: clock,
      },
      bag: { count: 1, cap: 60, percent: 1 },
      fishingState: 'active',
      spotId: 'pond',
      spotName: '마을 연못',
      seaTheme: 'deep',
    });
    const bagId = hub.publishBagSync('user-1', { count: 0, cap: 60, percent: 0 });
    clock -= 5_000; // 시계 역전 시에도 단조 증가 유지
    const spotId = hub.publishSpotChanged('user-1', { spotId: 'deep', spotName: '마리아나 해구', seaTheme: 'deep' });
    const statusId = hub.publishStatusChanged('user-1', 'idle');

    expect(catchId).toBe('1700000000000-1');
    expect(bagId).toBe('1700000000000-2');
    expect(spotId).toBe('1700000000000-3');
    expect(statusId).toBe('1700000000000-4');

    expect(mock.chunks[1]).toContain(`id: ${catchId}\nevent: catch\ndata: `);
    expect(mock.chunks[2]).toContain(`id: ${bagId}\nevent: bag_sync\ndata: `);
    expect(mock.chunks[3]).toContain(`id: ${spotId}\nevent: spot_changed\ndata: `);
    expect(mock.chunks[4]).toContain(`id: ${statusId}\nevent: status_changed\ndata: `);
    hub.close();
  });

  it('disconnectUser와 close는 활성 응답을 즉시 종료하고 타이머를 해제한다', () => {
    vi.useFakeTimers();
    const hub = createWidgetHub();
    const u1a = mockSseRes();
    const u1b = mockSseRes();
    const u2 = mockSseRes();

    hub.addClient('user-1', u1a.res);
    hub.addClient('user-1', u1b.res);
    hub.addClient('user-2', u2.res);

    hub.disconnectUser('user-1');
    expect(u1a.res.writableEnded).toBe(true);
    expect(u1b.res.writableEnded).toBe(true);
    expect(u2.res.writableEnded).toBe(false);
    expect(hub.hasSubscribers('user-1')).toBe(false);
    expect(hub.hasSubscribers('user-2')).toBe(true);

    hub.close();
    expect(u2.res.writableEnded).toBe(true);
    expect(hub.subscriberCount()).toBe(0);
  });

  it('싱글톤 제공자(provideWidgetHub / widgetHub)가 인스턴스를 교체한다', () => {
    const custom = createWidgetHub();
    provideWidgetHub(custom);
    expect(widgetHub()).toBe(custom);
  });
});
