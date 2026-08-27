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

// ---------- 관리자 읽기 API (0010 뷰/RPC — 읽기 전용) ----------
// 행 타입 = 마이그레이션 뷰의 컬럼명이 곧 계약이다. 소비처(admin/**)는 이 인터페이스만
// 알고 supabase-js·뷰 이름 같은 전송 상세는 http 구현 안에 갇힌다.
// local 구현은 "클라우드 미설정"이라 데이터가 존재하지 않는다 — 접근 판정만 'local'을
// 주고 나머지는 reject한다(조용한 빈 배열은 거짓말이라).

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  is_anonymous: boolean | null;
  signed_up_at: string | null;
  last_sign_in_at: string | null;
  gold: number | string | null;
  fame: number | string | null;
  boat: number | null;
  rod: number | null;
  location_kind: 'region' | 'base' | null;
  location_id: string | null;
  /** 방문 지역 배열(state.visited) — 지역 도달 퍼널의 근거. 세이브 v8 blob 파생 */
  visited: string[] | null;
  restricted: boolean | null;
  save_version: number | string | null;
  last_action_at: string | null;
}

export interface AdminDailyActiveRow { day: string; dau: number; wau7: number }
export interface AdminRetentionRow {
  cohort: string; users: number;
  d1: number | null; d3: number | null; d7: number | null;
  d14: number | null; d30: number | null;
}
export interface AdminEconomyRow {
  day: string; sells: number; sell_gold: number; coupon_gold: number;
  rod_cost: number; boat_cost: number; bait_cost: number;
}
export interface AdminCatchQualityRow {
  day: string; catches: number; perfect: number; with_bait: number; avg_size: number | null;
}
export interface AdminSpamFlagRow {
  user_id: string; catches_7d: number; fast_gap_7d: number;
  perfect_pct: number | null; perfect_pct_global: number | null;
}
export interface AdminImportLogRow {
  id: number; user_id: string; created_at: string;
  gold: number | string | null; fame: number | string | null;
}
export interface AdminDexMismatchRow {
  user_id: string; fish_id: string; form: string;
  dex_count: number; event_count: number; missing_events: number;
}
export interface AdminEventRow {
  id: number; user_id: string; type: string;
  payload: Record<string, unknown>; created_at: string;
}

/** 관리자 판정 — local은 "클라우드 미설정"(권한 실패 아님), denied는 DB admins 비등록 */
export interface AdminAccessResult {
  kind: 'granted' | 'denied' | 'local';
  /** 현재 세션 uid — denied 안내("이 uid를 등록하라")용. 세션 토큰 로컬 읽기라 왕복 없음 */
  uid: string | null;
}

export interface AdminApi {
  access(): Promise<AdminAccessResult>;
  users(): Promise<AdminUserRow[]>;
  dailyActive(days: number): Promise<AdminDailyActiveRow[]>;
  retention(): Promise<AdminRetentionRow[]>;
  economy(days: number): Promise<AdminEconomyRow[]>;
  catchQuality(days: number): Promise<AdminCatchQualityRow[]>;
  spamFlags(): Promise<AdminSpamFlagRow[]>;
  imports(): Promise<AdminImportLogRow[]>;
  dexMismatch(): Promise<AdminDexMismatchRow[]>;
  recentEvents(): Promise<AdminEventRow[]>;
  userEvents(userId: string, limit?: number): Promise<AdminEventRow[]>;
  /** 연결된 Supabase 프로젝트 식별자 — 운영/스테이징 착오 방지 표시값(Ops 탭) */
  projectRef(): string | null;
}

export interface ApiClient {
  game: Backend;
  auth: AuthApi;
  storage: StorageApi;
  admin: AdminApi;
  isLocal: boolean;
}
