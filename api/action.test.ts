// 핸들러 규약 스모크 — v0.2.2 사고 클래스 ②(호출 규약) 가드.
// Vercel Node 런타임은 default export를 Node 스타일 (req, res)로 호출한다 — 이 테스트는
// 그 계약(시그니처·res.status().json() 체인·메서드/설정 가드)이 커밋 전에 깨지면 CI에서 즉사시킨다.
// 모듈 해상도 클래스 ①은 api/tsconfig의 nodenext가 정적으로 전수 검사한다(여기서 중복 안 함).
import { describe, it, expect } from 'vitest';
import handler from './action.js';
import { APP_VERSION } from '../src/version.js';

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

  it('배포 식별자 불일치(또는 부재)면 426 — 낡은 탭 차단', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(426);
    expect(res.body).toEqual({ error: 'version-mismatch', server: APP_VERSION });
    const res2 = mkRes();
    await handler({ method: 'POST', headers: { 'x-build-id': 'other-deploy' } } as never, res2 as never);
    expect(res2.statusCode).toBe(426);
  });

  it('릴리즈 버전이 같아도 배포가 다르면 426 — dev 빌드끼리 갈리는 게 요점', async () => {
    // 구버전 클라가 보내던 헤더. APP_VERSION은 dev에서 안 올라가 늘 일치했다 → 426이 안 떴다
    const res = mkRes();
    await handler({ method: 'POST', headers: { 'x-client-version': APP_VERSION } } as never, res as never);
    expect(res.statusCode).toBe(426);
  });

  it('배포 식별자 일치 + 서버 환경변수 없으면 500 server-config (테스트 환경 = env 없음)', async () => {
    // 테스트 환경엔 VERCEL_GIT_COMMIT_SHA가 없어 서버 기준값이 'dev'로 떨어진다
    const res = mkRes();
    await handler({ method: 'POST', headers: { 'x-build-id': 'dev' } } as never, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'server-config' });
  });
});
