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

// ---------- 관리자 읽기 (로컬 = 클라우드 미설정) ----------
// events·saves_current 같은 운영 원장이 로컬에는 존재하지 않는다. 그래서 접근 판정은
// 'local'을 주고 데이터 getter는 **reject**한다 — 조용한 빈 배열 반환은 "데이터가 없다"라는
// 거짓말이 되고, 게이트를 우회한 오용을 숨긴다. 정상 경로에서는 RequireAdmin이 local을
// 걸러주므로 여기가 불리는 일 자체가 없어야 한다.
// reject는 Promise로 돌려야 한다 — 동기 throw면 호출부의 await/rejects 계약이 깨진다.

import type { AdminApi } from './types';

const noCloudAdminData = (): Error =>
  new Error('관리자 데이터는 클라우드 연결(운영/스테이징 Supabase) 환경에서만 읽힌다');

const rejected = <T>(): Promise<T> => Promise.reject(noCloudAdminData());

class LocalAdmin implements AdminApi {
  async access(): Promise<{ kind: 'local'; uid: null }> {
    return { kind: 'local', uid: null };
  }
  users(): Promise<never[]> { return rejected(); }
  dailyActive(_days: number): Promise<never[]> { return rejected(); }
  retention(): Promise<never[]> { return rejected(); }
  economy(_days: number): Promise<never[]> { return rejected(); }
  catchQuality(_days: number): Promise<never[]> { return rejected(); }
  spamFlags(): Promise<never[]> { return rejected(); }
  imports(): Promise<never[]> { return rejected(); }
  dexMismatch(): Promise<never[]> { return rejected(); }
  recentEvents(): Promise<never[]> { return rejected(); }
  userEvents(_userId: string, _limit?: number): Promise<never[]> { return rejected(); }
  projectRef(): string | null {
    return null;
  }
}

export function createLocalApi(initial: GameState):
{ game: Backend; auth: AuthApi; storage: StorageApi; admin: AdminApi } {
  return {
    game: new LocalBackend(initial),
    auth: new LocalAuth(),
    storage: new LocalStorageApi(),
    admin: new LocalAdmin(),
  };
}
