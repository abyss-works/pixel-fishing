// 현상금 서버 헬퍼 — DB 행 → 주입 진실 변환과 만료 판정.
// 계약 테스트는 리듀서의 수주 한도와 납품 완료 규칙을 검증한다.
// 여기는 서버만 아는 것(행 해석·하루 경계 적용)만 다룬다.
import { describe, it, expect } from 'vitest';
import { catchProgressQuests, expiredQuests, toBountyCtx } from './action.js';
import { gameDayStartISO } from '../src/game/rules/time.js';

// 2026-08-22 15:00 KST의 게임 날짜는 그날 04:00 KST에 시작했다 = 2026-08-21T19:00:00Z
const dayStart = gameDayStartISO('2026-08-22T06:00:00.000Z');
const BEFORE = '2026-08-21T18:59:59.999Z'; // 03:59:59.999 KST — 전날

describe('toBountyCtx', () => {
  const rows = {
    clears: [
      { kind: 'general', cleared_at: '2026-08-22T01:00:00.000Z' }, // 22일 04:00 KST 이후 — 집계
      { kind: 'general', cleared_at: BEFORE },                      // 전날 — 제외
      { kind: 'named', cleared_at: '2026-08-22T02:00:00+00:00' },   // Postgres 표기 — 집계
    ],
    progress: [
      { quest_id: 'pacific-easy-common', progress: 250, started_at: '2026-08-22T00:00:00+00:00' }, // 수량 충족 — 완료
      { quest_id: 'pacific-easy-rare', progress: 3, started_at: '2026-08-22T00:00:00+00:00' },     // 미달 — 진행 중
    ],
    tickets: [],
  };

  it('오늘 클리어를 갈래별로 센다 — 경계 이전 클리어는 세지 않는다', () => {
    expect(toBountyCtx(rows, dayStart).clearsToday).toEqual({ general: 1, named: 1 });
  });

  it('클리어 기록이 없으면 두 갈래 모두 0이다', () => {
    expect(toBountyCtx({ ...rows, clears: [] }, dayStart).clearsToday).toEqual({ general: 0, named: 0 });
  });

  it('수주만으로는 클리어로 세지 않는다 — 진행 행이 있어도 클리어 0이다', () => {
    expect(toBountyCtx({ ...rows, clears: [] }, dayStart).clearsToday).toEqual({ general: 0, named: 0 });
    expect(toBountyCtx({ ...rows, clears: [] }, dayStart).active).toHaveLength(2);
  });

  it('완료와 진행 중을 구분한다', () => {
    const ctx = toBountyCtx(rows, dayStart);
    expect(ctx.complete).toEqual(['pacific-easy-common']);
    expect(ctx.active).toEqual(['pacific-easy-common', 'pacific-easy-rare']);
  });

  it('경계 이전에 수주하고 마치지 못한 의뢰는 진행 중에서 빠진다 — 03:59:59.999와 04:00 정각이 갈린다', () => {
    const ctx = toBountyCtx({
      ...rows,
      progress: [
        { quest_id: 'pacific-easy-common', progress: 249, started_at: BEFORE },
        { quest_id: 'pacific-easy-rare', progress: 0, started_at: dayStart },
      ],
    }, dayStart);
    expect(ctx.active).toEqual(['pacific-easy-rare']);
    expect(ctx.complete).toEqual([]);
  });

  it('경계 이전에 수주했어도 마친 의뢰는 남고 보상을 받을 수 있다', () => {
    const ctx = toBountyCtx({
      ...rows,
      progress: [{ quest_id: 'pacific-easy-common', progress: 250, started_at: BEFORE }],
    }, dayStart);
    expect(ctx.active).toEqual(['pacific-easy-common']);
    expect(ctx.complete).toEqual(['pacific-easy-common']);
  });

  it('만료된 의뢰의 도전권은 주입하지 않는다', () => {
    const ctx = toBountyCtx({
      ...rows,
      progress: [
        { quest_id: 'pacific-named-megalodon', progress: 0, started_at: BEFORE },
        { quest_id: 'seasia-named-leviathan', progress: 0, started_at: dayStart },
      ],
      tickets: [
        { quest_id: 'pacific-named-megalodon', issued_at: '2026-08-21T18:30:00.000Z' },
        { quest_id: 'seasia-named-leviathan', issued_at: '2026-08-22T01:00:00.000Z' },
      ],
    }, dayStart);
    expect(ctx.tickets).toEqual([{ questId: 'seasia-named-leviathan', issuedAt: '2026-08-22T01:00:00.000Z' }]);
  });

  it('수주 중인 의뢰의 도전권 목록을 그대로 주입한다', () => {
    const ctx = toBountyCtx({
      ...rows,
      progress: [{ quest_id: 'pacific-named-megalodon', progress: 0, started_at: '2026-08-22T00:00:00.000Z' }],
      tickets: [{ quest_id: 'pacific-named-megalodon', issued_at: '2026-08-22T01:00:00.000Z' }],
    }, dayStart);
    expect(ctx.tickets).toEqual([
      { questId: 'pacific-named-megalodon', issuedAt: '2026-08-22T01:00:00.000Z' },
    ]);
  });

  it('없는 의뢰의 진행 행은 무시한다', () => {
    const ctx = toBountyCtx(
      { ...rows, progress: [{ quest_id: 'nope', progress: 99, started_at: dayStart }] }, dayStart);
    expect(ctx.complete).toEqual([]);
    expect(ctx.active).toEqual([]);
  });
});

describe('expiredQuests — 정리할 만료 의뢰', () => {
  it('경계 이전에 수주하고 수량 미달인 행만 돌려준다', () => {
    const expired = expiredQuests({
      clears: [], tickets: [],
      progress: [
        { quest_id: 'pacific-easy-common', progress: 249, started_at: BEFORE },     // 만료
        { quest_id: 'pacific-easy-rare', progress: 10, started_at: BEFORE },        // 수량 충족(10) — 남는다
        { quest_id: 'pacific-easy-epic', progress: 0, started_at: dayStart },       // 오늘 수주 — 남는다
        { quest_id: 'nope', progress: 0, started_at: BEFORE },                      // 없는 의뢰 — 다루지 않는다
      ],
    }, dayStart);
    expect(expired).toEqual([{ id: 'pacific-easy-common', count: 250 }]);
  });
});

describe('catchProgressQuests — 캐치가 진전시키는 의뢰', () => {
  const caught = (spot: string, fishId: string) => [{ type: 'catch', payload: { spot, fishId } }];

  it('수주 중인 일반 의뢰만 진전시킨다 — 목록에 없는 만료 의뢰는 올리지 않는다', () => {
    // mackerel은 태평양 일반 등급
    expect(catchProgressQuests(caught('sea', 'mackerel'), ['pacific-easy-common'])).toEqual(['pacific-easy-common']);
    expect(catchProgressQuests(caught('sea', 'mackerel'), [])).toEqual([]);
  });

  it('네임드는 캐치로 진전하지 않는다', () => {
    expect(catchProgressQuests(caught('sea', 'megalodon'), ['pacific-named-megalodon'])).toEqual([]);
  });
});
