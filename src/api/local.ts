// 로컬 API 구현 — supabase 미설정(dev·테스트) 전용
// 게임은 LocalBackend(메모리 + localStorage), 인증은 가짜 계정으로 동작한다
import { LocalBackend } from '../backend/local';
import type { Backend } from '../backend/types';
import type { AuthApi, StorageApi } from './types';
import type { AuthResult } from '../backend/auth';
import type { GameState } from '../game/logic';
import { saveCode as encodeSave } from '../backend/auth';

const DEV_ACCOUNT = 'dev@localhost';
const DEV_UID = '00000000-0000-4000-8000-000000000000';

class LocalAuth implements AuthApi {
  isConfigured = false;

  async ensureSession(): Promise<string | null> {
    return DEV_UID;
  }
  async currentAccount(): Promise<string | null> {
    return DEV_ACCOUNT;
  }
  async getSession(): Promise<{ uid: string | null; email: string | null }> {
    return { uid: DEV_UID, email: DEV_ACCOUNT };
  }
  onAuthStateChange(_cb: (event: string) => void): { unsubscribe(): void } {
    return { unsubscribe() {} };
  }
  async signUp(): Promise<AuthResult> {
    return { ok: false, msg: '클라우드 미설정' };
  }
  async signIn(): Promise<AuthResult> {
    return { ok: false, msg: '클라우드 미설정' };
  }
  async signOut(): Promise<void> {}
  async requestPasswordReset(): Promise<AuthResult> {
    return { ok: false, msg: '클라우드 미설정' };
  }
  async applyNewPassword(): Promise<AuthResult> {
    return { ok: false, msg: '클라우드 미설정' };
  }
  onAccountNudged(): boolean {
    return !!localStorage.getItem('pf-account-nudged');
  }
  markAccountNudged(): void {
    localStorage.setItem('pf-account-nudged', '1');
  }
}

class LocalStorageApi implements StorageApi {
  saveCode(state: GameState): string {
    return encodeSave(state);
  }
  decodeSave(code: string): unknown {
    return JSON.parse(decodeURIComponent(atob(code.trim())));
  }
}

export function createLocalApi(initial: GameState): { game: Backend; auth: AuthApi; storage: StorageApi } {
  return {
    game: new LocalBackend(initial),
    auth: new LocalAuth(),
    storage: new LocalStorageApi(),
  };
}
