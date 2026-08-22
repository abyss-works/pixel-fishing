// 핸들러 규약 스모크 — v0.2.2 사고 클래스 ②(호출 규약) 가드.
// Vercel Node 런타임은 default export를 Node 스타일 (req, res)로 호출한다 — 이 테스트는
// 그 계약(시그니처·res.status().json() 체인·메서드/설정 가드)이 커밋 전에 깨지면 CI에서 즉사시킨다.
// 모듈 해상도 클래스 ①은 api/tsconfig의 nodenext가 정적으로 전수 검사한다(여기서 중복 안 함).
import { describe, it, expect } from 'vitest';
import handler, { recordsFor } from './action.js';
import { APP_VERSION } from '../src/version.js';
import { addCatch, migrate, newState, makeInstance, FISH } from '../src/game/logic.js';
import type { GameAction, ActionResult } from '../src/game/actions.js';

function mkRes() {
  const r = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) { r.statusCode = code; return r; },
    json(b: unknown) { r.body = b; },
    end() { /* 204 무본문 */ },
  };
  return r;
}

describe('api/action 핸들러 규약 (Node 스타일 req/res)', () => {
  it('GET은 워밍/헬스 핑 — 204 무본문 (콘솔 노이즈 없는 응답)', async () => {
    const res = mkRes();
    await handler({ method: 'GET', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(204);
  });

  it('GET/POST 외 메서드는 405', async () => {
    const res = mkRes();
    await handler({ method: 'PUT', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'method-not-allowed' });
  });

  it('클라 버전 불일치(또는 부재)면 426 — 낡은 탭 차단', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(426);
    expect(res.body).toEqual({ error: 'version-mismatch', server: APP_VERSION });
    const res2 = mkRes();
    await handler({ method: 'POST', headers: { 'x-client-version': '0.0.1' } } as never, res2 as never);
    expect(res2.statusCode).toBe(426);
  });

  it('버전 일치 + 서버 환경변수 없으면 500 server-config (테스트 환경 = env 없음)', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: { 'x-client-version': APP_VERSION } } as never, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'server-config' });
  });
});

// records(0006)는 events 보관주기와 무관한 통계 정본이라, 어떤 행이 나가는지가 계약이다.
describe('records 행 생성 (세이브 v8)', () => {
  const NOW = '2026-08-22T03:00:00.000Z';
  const carp = FISH.find(f => f.id === 'carp')!;
  const catchAction: GameAction = { type: 'catch', spot: 'pond', judgment: 'perfect' };

  it('catch — 리듀서가 계산한 종×폼 기록을 절대값으로 1행만 올린다', () => {
    const inst = makeInstance(carp, { size: 42, form: 'variant' },
      { uid: 'u1', now: NOW, spot: 'pond', judgment: 'perfect' });
    const state = addCatch(newState(), inst, carp, '2026-08-22');
    const result: ActionResult = {
      type: 'catch', fishId: 'carp', uid: 'u1',
      info: { size: 42, form: 'variant', percentile: 1, isBig: true, isNew: true },
    };
    expect(recordsFor('user-1', state, catchAction, result, NOW)).toEqual([{
      user_id: 'user-1', fish_id: 'carp', form: 'variant',
      count: 1, max_size: 42, first_caught: '2026-08-22', updated_at: NOW,
    }]);
  });

  it('import — 도감 전체를 재시딩한다 (이사 코드로 기록이 통째로 바뀌므로)', () => {
    const state = migrate({
      v: 7, caught: { carp: 5, crucian: 1 }, variantCaught: { carp: 2 },
      maxSize: { carp: 30 }, bag: [], coupons: [], locked: [],
    }, () => 'x');
    const rows = recordsFor('user-1', state, { type: 'import', save: {} }, { type: 'none' }, NOW);
    expect(rows).toHaveLength(3); // carp normal/variant + crucian normal
    expect(rows).toContainEqual({
      user_id: 'user-1', fish_id: 'carp', form: 'normal',
      count: 3, max_size: 30, first_caught: null, updated_at: NOW,
    });
  });

  it('그 외 액션은 기록을 건드리지 않는다', () => {
    expect(recordsFor('user-1', newState(), { type: 'upgradeRod' }, { type: 'none' }, NOW))
      .toEqual([]);
  });
});
