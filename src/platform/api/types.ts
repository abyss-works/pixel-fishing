// API 계약 — 화면과 기능은 이 타입을 사용하고 adapters/가 HTTP·로컬 구현을 제공한다.
import type { GameAction, ActionResult } from '../../game/rules/actions';
import type { RejectReason } from '../../game/rules/rules';
import type { GameState } from '../../game/rules/logic';
import type { BountyKind } from '../../game/content/bounties';
import type { MaybePromise } from '../../shared/lib/when';

export type { MaybePromise } from '../../shared/lib/when';

export type DispatchResult =
  | { status: 'ok'; state: GameState; result: ActionResult }
  | { status: 'rejected'; error: RejectReason };

/** 게임 상태의 읽기·액션 처리 경계. HTTP와 로컬 구현은 adapters/에 둔다. */
export interface GameGateway {
  load(): MaybePromise<GameState | null>;
  dispatch(action: GameAction): MaybePromise<DispatchResult>;
  getNickname(): MaybePromise<string | null>;
  warmup?(): void;
}

export type AuthResult = { ok: true } | { ok: false; msg: string; code?: string };

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
  /** 마지막으로 계정 만들기 넛지를 띄운 날(KST yyyy-mm-dd). 없으면 null */
  accountNudgedDay(): string | null;
  markAccountNudged(day: string): void;
}

export interface StorageApi {
  loadLegacy(): { game: GameState; notice: string | null; legacy: boolean };
  clearLegacySave(): void;
  saveCode(state: GameState): string;
}

/** 랭킹 — 서버 읽기 함수의 응답. 닉네임·순위·값만 담긴다 */
export type RankingBoardId = 'fame' | 'dex' | 'species';
export interface RankingRow { rank: number; nickname: string | null; value: number; me: boolean }
/** species 표는 fishId 어종의 사람별 최대 크기(cm) 순위다 */
export interface RankingBoard { board: RankingBoardId; fishId?: string; top: RankingRow[]; me: { rank: number; value: number } | null }

export interface BountyProgressRow { questId: string; progress: number }
export interface BountyTicketRow { questId: string; issuedAt: string }
export interface BountySnapshot {
  /** 오늘(게임 날짜, KST 04:00 경계) 클리어한 횟수 — 수배판에서 보상을 받은 납품·토벌. 갈래별로 센다 */
  clearsToday: Record<BountyKind, number>;
  /** 수주 중인 의뢰의 진행도 — 날이 바뀌며 만료된 의뢰는 담기지 않는다 */
  progress: BountyProgressRow[];
  /** 수주 중인 의뢰의 도전권 */
  tickets: BountyTicketRow[];
}

// ---------- 관리자 읽기 API (서버 읽기 함수, 읽기 전용) ----------
// 행 타입 = 서버 읽기 함수가 돌려주는 행의 컬럼명이 곧 계약이다(관리자 뷰의 컬럼명과 같다).
// 소비처(admin/**)는 이 인터페이스만 알고 요청 이름·세션 토큰 같은 전송 상세는 http 구현 안에 갇힌다.
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
/** 바운티 퍼널 일계 — 네임드 수주 → 흔적(도전권) → 결투 승·패 → 토벌 보상, 일반 수주·납품 */
export interface AdminBountyFunnelRow {
  day: string; named_accepts: number; tickets: number; duels_won: number; duels_lost: number;
  named_rewards: number; general_accepts: number; general_rewards: number;
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
export interface AdminLetterRow {
  id: number; user_id: string; text: string; created_at: string;
}

/** 관리자 판정 — local은 "클라우드 미설정"(권한 실패 아님), denied는 DB admins 비등록 */
export interface AdminAccessResult {
  kind: 'granted' | 'denied' | 'local';
  /** 서버가 확인한 세션 uid. denied 안내("이 uid를 등록하라")에 쓴다 */
  uid: string | null;
}

export interface AdminApi {
  access(): Promise<AdminAccessResult>;
  users(): Promise<AdminUserRow[]>;
  dailyActive(days: number): Promise<AdminDailyActiveRow[]>;
  retention(): Promise<AdminRetentionRow[]>;
  economy(days: number): Promise<AdminEconomyRow[]>;
  bountyFunnel(days: number): Promise<AdminBountyFunnelRow[]>;
  catchQuality(days: number): Promise<AdminCatchQualityRow[]>;
  spamFlags(): Promise<AdminSpamFlagRow[]>;
  imports(): Promise<AdminImportLogRow[]>;
  dexMismatch(): Promise<AdminDexMismatchRow[]>;
  recentEvents(): Promise<AdminEventRow[]>;
  userEvents(userId: string, limit?: number): Promise<AdminEventRow[]>;
  letters(): Promise<AdminLetterRow[]>;
  /** 연결된 Supabase 프로젝트 식별자 — 운영/스테이징 착오 방지 표시값(Ops 탭) */
  projectRef(): string | null;
}

export interface ApiClient {
  /** 게임 상태 게이트웨이 생성. LocalGameGateway가 상태를 소유하므로 마운트마다 새로 만든다. */
  createGameGateway(initial: GameState): GameGateway;
  auth: AuthApi;
  storage: StorageApi;
  admin: AdminApi;
}
