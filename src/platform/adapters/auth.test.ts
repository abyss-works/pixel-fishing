// P1 클라우드 저장 — 오프라인 모드 무해성 
// 이 파일은 인증과 HTTP 게임 게이트웨이의 오프라인 실패 계약을 확인한다.
import { describe, it, expect } from 'vitest';
import {
  isCloud, authClient, ensureSession,
  currentAccount, signInWithEmail, requestPasswordReset, applyNewPassword, startGoogleAuth, accountProviders,
  googleReturnUrl, parseGoogleLanding, classifyEmailSignInFailure,
} from './auth';
import { HttpGameGateway } from './httpGameGateway';

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
    expect(await currentAccount()).toBeNull();
    expect((await startGoogleAuth('link', 'link-guest')).ok).toBe(false);
    expect(await accountProviders()).toBeNull();
    expect((await signInWithEmail('a@b.c', '123456')).ok).toBe(false);
    expect((await requestPasswordReset('a@b.c')).ok).toBe(false);
    expect((await applyNewPassword('123456')).ok).toBe(false);
  });
});

describe('구글 인증 복귀 주소', () => {
  it('복귀 주소는 앱 루트에 구분 표지를 단 같은 출처 주소다', () => {
    expect(googleReturnUrl('https://game.test', 'link-guest')).toBe('https://game.test/?google=link-guest');
  });

  it('표지만 있으면 오류 없는 복귀다', () => {
    expect(parseGoogleLanding('?google=link-email')).toEqual({ tag: 'link-email', error: null, rest: '' });
  });

  it('오류 코드가 붙으면 코드를 돌려주고 두 질의를 지운 나머지를 남긴다', () => {
    expect(parseGoogleLanding('?google=link-guest&error=email_account_exists&x=1'))
      .toEqual({ tag: 'link-guest', error: 'email_account_exists', rest: '?x=1' });
  });

  it('표지가 없으면 구글 복귀가 아니다 (재설정 링크의 error 질의와 섞이지 않는다)', () => {
    expect(parseGoogleLanding('')).toBeNull();
    expect(parseGoogleLanding('?error=INVALID_TOKEN')).toBeNull();
    expect(parseGoogleLanding('?token=abc')).toBeNull();
  });

  it('표지 값이 비어 있으면 복귀로 보지 않는다', () => {
    expect(parseGoogleLanding('?google=')).toBeNull();
  });
});

describe('이메일 로그인 실패의 분류', () => {
  it('서버가 틀린 입력을 알리면 인증 실패 코드다', () => {
    expect(classifyEmailSignInFailure({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' })).toMatchObject({ ok: false, code: 'invalid_credentials' });
  });

  it('401은 본문에 코드가 없어도 인증 실패다', () => {
    expect(classifyEmailSignInFailure({ status: 401, message: '' })).toMatchObject({ ok: false, code: 'invalid_credentials' });
    expect(classifyEmailSignInFailure({ status: 401 })).toMatchObject({ code: 'invalid_credentials' });
  });

  it('429는 요청 과다 코드다', () => {
    expect(classifyEmailSignInFailure({ status: 429, message: 'Too many requests' })).toMatchObject({ code: 'over_email_send_rate_limit' });
  });

  it('이메일 형식 거부는 형식 오류 코드다', () => {
    expect(classifyEmailSignInFailure({ status: 400, code: 'INVALID_EMAIL' })).toMatchObject({ code: 'validation_failed' });
  });

  it('알 수 없는 코드와 JSON이 아닌 본문(상태만 있는 오류)은 코드 없는 실패다', () => {
    for (const e of [{ status: 400, code: 'SOMETHING_NEW' }, { status: 502, message: '' }, undefined]) {
      const r = classifyEmailSignInFailure(e);
      expect(r.ok).toBe(false);
      expect('code' in r ? r.code : undefined).toBeUndefined();
    }
  });

  it('요청이 서버에 닿지 못해 던져진 오류는 네트워크 코드다', () => {
    expect(classifyEmailSignInFailure(new TypeError('Failed to fetch'))).toMatchObject({ ok: false, code: 'network' });
  });
});
