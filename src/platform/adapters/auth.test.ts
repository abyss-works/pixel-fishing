// P1 클라우드 저장 — 오프라인 모드 무해성 
// 이 파일은 인증과 HTTP 게임 게이트웨이의 오프라인 실패 계약을 확인한다.
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  isCloud, authClient, ensureSession,
  currentAccount, startGoogleAuth,
  googleReturnUrl, parseGoogleLanding,
} from './auth';
import { HttpGameGateway } from './httpGameGateway';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('클라우드 저장', () => {
  it('클라우드 빌드가 아니면 오프라인 모드 (인증 클라이언트 null, 호출은 전부 무해)', async () => {
    expect(isCloud).toBe(false); // 테스트 환경엔 VITE_CLOUD 없음
    expect(authClient).toBeNull();
    expect(await ensureSession()).toBeNull();
    const http = new HttpGameGateway();
    expect(await http.load()).toBeNull();
    // dev3: 인프라 실패는 값이 아니라 AppError로 던진다 — 정책 한 곳이 처리한다
    // . 호출자에 방어 분기를 두지 않기 위한 계약.
    await expect(http.dispatch({ type: 'upgradeRod' })).rejects.toMatchObject({
      name: 'AppError', kind: 'network',
    });
  });

  it('계정 함수도 오프라인 모드에서 무해 (v0.4.0)', async () => {
    expect(await currentAccount()).toEqual({ status: 'guest' });
    expect((await startGoogleAuth('link', 'link-guest')).ok).toBe(false);
  });
});

describe('구글 인증 복귀 주소', () => {
  it('복귀 주소는 앱 루트에 구분 표지를 단 같은 출처 주소다', () => {
    expect(googleReturnUrl('https://game.test', 'link-guest')).toBe('https://game.test/?google=link-guest');
  });

  it('표지만 있으면 오류 없는 복귀다', () => {
    expect(parseGoogleLanding('?google=sign-in')).toEqual({ tag: 'sign-in', error: null, rest: '' });
  });

  it('오류 코드가 붙으면 코드를 돌려주고 두 질의를 지운 나머지를 남긴다', () => {
    expect(parseGoogleLanding('?google=link-guest&error=email_account_exists&x=1'))
      .toEqual({ tag: 'link-guest', error: 'email_account_exists', rest: '?x=1' });
  });

  it('표지가 없으면 구글 복귀가 아니다', () => {
    expect(parseGoogleLanding('')).toBeNull();
    expect(parseGoogleLanding('?error=INVALID_TOKEN')).toBeNull();
    expect(parseGoogleLanding('?token=abc')).toBeNull();
  });

  it('표지 값이 비어 있으면 복귀로 보지 않는다', () => {
    expect(parseGoogleLanding('?google=')).toBeNull();
  });
});

describe('게임 세션 로그아웃 격리', () => {
  it('signOutAccount는 게임 인증 경로(/api/auth/sign-out)만 호출하고 관리자 인증 경로를 건드리지 않는다', async () => {
    vi.stubEnv('VITE_CLOUD', '1');
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const mod = await import('./auth');
    await mod.signOutAccount();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/auth/sign-out');
    expect(url).not.toContain('/api/admin');
  });

  it('startGoogleAuth가 429 응답을 받으면 일반 속도 제한 코드 rate_limited를 돌려준다', async () => {
    vi.stubEnv('VITE_CLOUD', '1');
    vi.resetModules();
    vi.stubGlobal('window', { location: { origin: 'https://game.test' } });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Too many requests' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const mod = await import('./auth');
    const result = await mod.startGoogleAuth('sign-in', 'test-tag');

    expect(result).toEqual({
      ok: false,
      msg: '요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요.',
      code: 'rate_limited',
    });
  });
});
