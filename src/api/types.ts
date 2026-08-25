// API 계층 타입 — 프론트는 이 인터페이스만 본다 (http/local 구현 교체 가능)
// game은 Backend(서버 권위 v0.5.0) 그대로, auth/storage는 여기서 통합한다
import type { Backend } from '../backend/types';
import type { AuthResult } from '../backend/auth';
import type { GameState } from '../game/logic';

export type { Backend } from '../backend/types';
export type { AuthResult } from '../backend/auth';

export interface AuthApi {
  isConfigured: boolean;
  ensureSession(): Promise<string | null>;
  currentAccount(): Promise<string | null>;
  getSession(): Promise<{ uid: string | null; email: string | null }>;
  onAuthStateChange(cb: (event: string) => void): { unsubscribe(): void };
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  applyNewPassword(password: string): Promise<AuthResult>;
  onAccountNudged(): boolean;
  markAccountNudged(): void;
}

export interface StorageApi {
  saveCode(state: GameState): string;
  decodeSave(code: string): unknown;
}

export interface ApiClient {
  game: Backend;
  auth: AuthApi;
  storage: StorageApi;
  isLocal: boolean;
}
