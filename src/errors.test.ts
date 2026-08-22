// 실패 처리 일원화 
// 정책이 "표"이기 때문에 테스트가 가능하다 — 지점마다 흩어진 if였다면 이 검증이 불가능했다.
import { describe, it, expect, vi } from 'vitest';
import { AppError, POLICY, asAppError, fail, subscribeFailure } from './errors';

describe('실패 분류', () => {
  it('모든 종류가 정책을 갖는다 — 새 종류를 추가하면 여기서 걸린다', () => {
    for (const [kind, policy] of Object.entries(POLICY)) {
      expect(policy.message, kind).toBeTruthy();
      expect(['warning', 'error']).toContain(policy.level);
    }
  });

  it('구조(이사 코드)는 "진행이 저장 안 된 실패"에만 — 서버 권위 전제', () => {
    // 저장이 안 된 것들 → 구조
    for (const kind of ['network', 'unauthorized', 'server'] as const) {
      expect(POLICY[kind].rescue, kind).toBe(true);
    }
    // outdated: 진행은 서버에 안전 — 새로고침 안내만
    expect(POLICY.outdated.rescue).toBe(false);
    expect(POLICY.outdated.modal).toBe('update');
    // bug: 완료된 액션은 이미 서버에 있다 + ErrorBoundary 화면과 겹친다
    expect(POLICY.bug.rescue).toBe(false);
  });

  it('asAppError: 알 수 없는 예외는 bug로 정규화되고 원인이 보존된다', () => {
    const raw = new TypeError('boom');
    const err = asAppError(raw);
    expect(err.kind).toBe('bug');
    expect(err.message).toBe('boom');
    expect(err.cause).toBe(raw);
    // 문자열 등 Error가 아닌 값도 받는다
    expect(asAppError('그냥 문자열').kind).toBe('bug');
    // 이미 AppError면 그대로 통과 (이중 포장 금지)
    const app = new AppError('network', 'x');
    expect(asAppError(app)).toBe(app);
  });
});

describe('싱크', () => {
  it('구독자에게 통지하고, 해지하면 더 오지 않는다', () => {
    const seen: string[] = [];
    const off = subscribeFailure(e => seen.push(e.kind));
    fail(new AppError('network', 'a'));
    off();
    fail(new AppError('server', 'b'));
    expect(seen).toEqual(['network']);
  });

  it('구독자 하나가 던져도 나머지 처리는 계속된다', () => {
    const other = vi.fn();
    const offBad = subscribeFailure(() => { throw new Error('구독자 폭발'); });
    const offOk = subscribeFailure(other);
    expect(() => fail(new AppError('server', 'x'))).not.toThrow();
    expect(other).toHaveBeenCalledOnce();
    offBad(); offOk();
  });
});
