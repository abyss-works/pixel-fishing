// HTTP API 구현 — 스테이징·운영 (supabase + /api/action)
import { HttpBackend } from '../backend/http';
import type { Backend } from '../backend/types';
import type { AuthApi, StorageApi } from './types';
import type { AuthResult } from '../backend/auth';
import type { GameState } from '../game/logic';
import {
  supabase,
  ensureSession,
  currentAccount,
  signUpWithEmail,
  signInWithEmail,
  signOutAccount,
  requestPasswordReset,
  applyNewPassword,
  saveCode as encodeSave,
} from '../backend/auth';

class HttpAuth implements AuthApi {
  isConfigured = true;

  ensureSession(): Promise<string | null> {
    return ensureSession();
  }
  currentAccount(): Promise<string | null> {
    return currentAccount();
  }
  async getSession(): Promise<{ uid: string | null; email: string | null }> {
    if (!supabase) return { uid: null, email: null };
    const { data: { session } } = await supabase.auth.getSession();
    return { uid: session?.user.id ?? null, email: session?.user.email ?? null };
  }
  onAuthStateChange(cb: (event: string) => void): { unsubscribe(): void } {
    if (!supabase) return { unsubscribe() {} };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => cb(event));
    return { unsubscribe: () => subscription.unsubscribe() };
  }
  signUp(email: string, password: string): Promise<AuthResult> {
    return signUpWithEmail(email, password);
  }
  signIn(email: string, password: string): Promise<AuthResult> {
    return signInWithEmail(email, password);
  }
  signOut(): Promise<void> {
    return signOutAccount();
  }
  requestPasswordReset(email: string): Promise<AuthResult> {
    return requestPasswordReset(email);
  }
  applyNewPassword(password: string): Promise<AuthResult> {
    return applyNewPassword(password);
  }
  onAccountNudged(): boolean {
    return !!localStorage.getItem('pf-account-nudged');
  }
  markAccountNudged(): void {
    localStorage.setItem('pf-account-nudged', '1');
  }
}

class HttpStorage implements StorageApi {
  saveCode(state: GameState): string {
    return encodeSave(state);
  }
  decodeSave(code: string): unknown {
    return JSON.parse(decodeURIComponent(atob(code.trim())));
  }
}

export function createHttpApi(): { game: Backend; auth: AuthApi; storage: StorageApi } {
  return {
    game: new HttpBackend(),
    auth: new HttpAuth(),
    storage: new HttpStorage(),
  };
}
