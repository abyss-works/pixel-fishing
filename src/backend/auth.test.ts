// P1 클라우드 저장 — 오프라인 모드 무해성 
// 세이브 읽기/쓰기는 v0.5.0에서 backend(HttpBackend/LocalBackend)로 이관 — 여기선 인증 계열만.
import { describe, it, expect } from 'vitest';
import {
  supabase, ensureSession,
  currentAccount, signUpWithEmail, signInWithEmail, requestPasswordReset, applyNewPassword,
} from './auth';
import { HttpBackend } from './http';

describe('클라우드 저장', () => {
  it('환경변수 없으면 오프라인 모드 (supabase null, 호출은 전부 무해)', async () => {
    expect(supabase).toBeNull(); // 테스트 환경엔 VITE_SUPABASE_* 없음
    expect(await ensureSession()).toBeNull();
    const http = new HttpBackend();
    expect(await http.load()).toBeNull();
    // dev3: 인프라 실패는 값이 아니라 AppError로 던진다 — 정책 한 곳이 처리한다
    // . 호출자에 방어 분기를 두지 않기 위한 계약.
    await expect(http.dispatch({ type: 'upgradeRod' })).rejects.toMatchObject({
      name: 'AppError', kind: 'network',
    });
  });

  it('계정 함수도 오프라인 모드에서 무해 (v0.4.0)', async () => {
    expect(await currentAccount()).toBeNull();
    expect((await signUpWithEmail('a@b.c', '123456')).ok).toBe(false);
    expect((await signInWithEmail('a@b.c', '123456')).ok).toBe(false);
    expect((await requestPasswordReset('a@b.c')).ok).toBe(false);
    expect((await applyNewPassword('123456')).ok).toBe(false);
  });
});
