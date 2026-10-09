// 현상금 서버 헬퍼 — KST 경계 집계와 DB 행 → 주입 진실 변환.
// 리듀서 강제(수주 상한·납품 완료)는 actions.bounty.test.ts가 맡는다.
// 여기는 서버만 아는 것(날짜 경계·행 해석)만 다룬다.
import { describe, it, expect } from 'vitest';
import { kstDayStartISO, toBountyCtx } from './action.js';

describe('kstDayStartISO', () => {
  it('KST 오후는 같은 날 자정을 UTC로 돌려준다', () => {
    // 2026-08-22 15:00 KST = 06:00Z
    expect(kstDayStartISO(Date.parse('2026-08-22T06:00:00.000Z')))
      .toBe('2026-08-21T15:00:00.000Z'); // 08-22 00:00+09:00
  });

  it('KST 자정 1ms 전은 전날로 떨어진다', () => {
    expect(kstDayStartISO(Date.parse('2026-08-21T14:59:59.999Z')))
      .toBe('2026-08-20T15:00:00.000Z');
  });

  it('KST 자정 정각은 당일로 올라간다', () => {
    expect(kstDayStartISO(Date.parse('2026-08-21T15:00:00.000Z')))
      .toBe('2026-08-21T15:00:00.000Z');
  });
});

describe('toBountyCtx', () => {
  const rows = {
    licenses: [{ zone: 'pacific' }],
    accepts: [
      { accepted_at: '2026-08-22T01:00:00.000Z', port: 'harbor' }, // 22일 KST — 집계
      { accepted_at: '2026-08-21T14:00:00.000Z', port: 'harbor' }, // 21일 KST — 제외
      { accepted_at: '2026-08-22T02:00:00.000Z', port: 'manila' }, // 타항구 — 통합에만
    ],
    progress: [
      { quest_id: 'pacific-easy-common', progress: 250 }, // 수량 충족 — 완료
      { quest_id: 'pacific-easy-rare', progress: 3 },     // 미달 — 진행 중
    ],
  };
  const dayStart = '2026-08-21T15:00:00.000Z'; // 08-22 KST 자정

  it('라이선스·통합 카운트·항구 카운트를 분리한다', () => {
    const ctx = toBountyCtx(rows, dayStart, 'harbor');
    expect(ctx.licensed).toEqual(['pacific']);
    expect(ctx.acceptsToday).toBe(2);
    expect(ctx.acceptsAtPortToday).toBe(1);
  });

  it('완료와 진행 중을 구분한다', () => {
    const ctx = toBountyCtx(rows, dayStart, 'harbor');
    expect(ctx.complete).toEqual(['pacific-easy-common']);
    expect(ctx.active).toEqual(['pacific-easy-common', 'pacific-easy-rare']);
  });

  it('없는 의뢰의 진행 행은 무시한다', () => {
    const ctx = toBountyCtx(
      { ...rows, progress: [{ quest_id: 'nope', progress: 99 }] }, dayStart, 'harbor');
    expect(ctx.complete).toEqual([]);
    expect(ctx.active).toEqual([]);
  });
});
