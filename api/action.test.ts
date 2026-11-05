// 핸들러 규약 스모크 — v0.2.2 사고 클래스 ②(호출 규약) 가드.
// 서버 진입점은 default export를 Node 스타일 (req, res)로 호출한다 — 이 테스트는
// 그 계약(시그니처·res.status().json() 체인·메서드/설정 가드)이 커밋 전에 깨지면 CI에서 즉사시킨다.
// NodeNext 설정이 서버 모듈의 해상도를 정적으로 검사하므로 여기서는 중복하지 않는다.
import { afterEach, describe, it, expect } from 'vitest';
import handler, { SKIP_DETAIL } from './action.js';
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

  describe('운영은 릴리즈 버전으로 낡은 탭을 가른다', () => {
    afterEach(() => { delete process.env.DEPLOY_ENV; });

    it('운영: 버전이 같으면 배포 식별자가 달라도 통과한다', async () => {
      process.env.DEPLOY_ENV = 'production';
      const res = mkRes();
      await handler({ method: 'POST', headers: { 'x-build-id': 'other-deploy', 'x-client-version': APP_VERSION } } as never, res as never);
      // 낡은 탭 판정을 지나 다음 관문(서버 설정)에서 멈춘다
      expect(res.statusCode).toBe(500);
    });

    it('운영: 버전이 다르거나 없으면 426이다', async () => {
      process.env.DEPLOY_ENV = 'production';
      for (const headers of [{ 'x-build-id': 'dev', 'x-client-version': '0.0.1' }, { 'x-build-id': 'dev' }]) {
        const res = mkRes();
        await handler({ method: 'POST', headers } as never, res as never);
        expect(res.statusCode).toBe(426);
        expect(res.body).toEqual({ error: 'version-mismatch', server: APP_VERSION });
      }
    });

    it('스테이징: 버전이 같아도 배포 식별자가 다르면 426이다', async () => {
      process.env.DEPLOY_ENV = 'preview';
      const res = mkRes();
      await handler({ method: 'POST', headers: { 'x-build-id': 'other-deploy', 'x-client-version': APP_VERSION } } as never, res as never);
      expect(res.statusCode).toBe(426);
    });
  });

  it('배포 식별자 일치 + 서버 환경변수 없으면 500 server-config (테스트 환경 = env 없음)', async () => {
    // 테스트 환경엔 BUILD_ID가 없어 서버 기준값이 'dev'로 떨어진다
    const res = mkRes();
    await handler({ method: 'POST', headers: { 'x-build-id': 'dev' } } as never, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'server-config' });
  });

  it('acceptQuest는 개체·도감 스킵 금지 — 라이선스 도감 판정이 상태를 본다', () => {
    // 수주는 상태를 바꾸지 않지만 판정에 dex가 필요해 records를 읽어야 한다.
    // 스킵하면 dex 빈 조립 → 도감과 무관하게 dex-incomplete 422 (수주 불가 장애).
    expect(SKIP_DETAIL.has('acceptQuest')).toBe(false);
    // 납품·불변 액션은 스킵 유지 (서버 주입·스칼라만이라 도감 불필요)
    expect(SKIP_DETAIL.has('deliverBounty')).toBe(true);
    expect(SKIP_DETAIL.has('exchangeArtifact')).toBe(true); // 재료·유물은 blob이라 스칼라 동봉
    expect(SKIP_DETAIL.has('boot')).toBe(true);
  });
});
