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

/**
 * 밸런스 라이브 지표. 서버가 한 번의 읽기로 모은 한 시점의 집계이고, 키 이름이 곧 계약이다.
 * 제재된 계정과 골드·명성이 모두 0인 익명 계정은 사용자 수 지표와 이벤트 지표 모두에서 빠져 있다.
 * 이벤트는 최근 7일만 보관하므로 기간은 1~7일이고, 지금부터 거슬러 올라가는 시간 구간이다. 도감, 배, 낚싯대,
 * 골드 분위, 이탈, 명성 게이트는 현재 저장 상태라 기간과 무관하다.
 */
export interface BalanceLive {
  /** 판정 분포. 기간 안 캐치를 판정별로 센 값이고 많은 순이다. 판정이 기록되지 않은 캐치는 '?'이다. pct는 전체 대비 백분율(소수 첫째 자리)이다 */
  judgment: { judgment: string; catches: number; pct: number }[];
  /** 체류 해역. 기간 안 캐치의 해역별 수와 사용자 수이고 캐치 많은 순이다. 해역이 기록되지 않은 캐치는 spot이 null이다 */
  spots: { spot: string | null; catches: number; users: number }[];
  /** 도감 진행. 일반 폼을 하나 이상 발견한 사용자의 발견 어종 수 분포이다. 10종 구간이고 fromSpecies 90은 90종 이상이다 */
  dexBuckets: { fromSpecies: number; users: number }[];
  /** 배 단계 분포. boat 0은 배가 없는 상태이다 */
  boats: { boat: number; users: number }[];
  /** 낚싯대 레벨 분포. 5레벨 구간이고 fromLevel 31은 31레벨 이상이다 */
  rodBuckets: { fromLevel: number; users: number }[];
  /** 골드 잔고의 25·50·75·90분위와 최대. 사용자가 없으면 모두 null이다 */
  gold: { p25: number | null; p50: number | null; p75: number | null; p90: number | null; max: number | null };
  /** 골드 흐름. 기간 안 유입(판매, 쿠폰)과 유출(강화, 배, 미끼)의 합이다 */
  goldFlow: { sellGold: number; couponGold: number; rodCost: number; boatCost: number; baitCost: number };
  /** 일일 활성. 이벤트가 있는 사용자 수이다. KST 날짜(yyyy-mm-dd) 오름차순이고 이벤트가 없는 날은 행이 없다. 기간 시작 시각이 날짜 중간이면 첫 날은 일부만 센다 */
  dau: { day: string; dau: number }[];
  /** 이탈 지점. 7일 넘게 저장이 없는 사용자의 배별 인원과 평균 명성, 평균 낚싯대 레벨이다 */
  churn: { boat: number; users: number; avgFame: number; avgRod: number }[];
  /** 바운티 퍼널. 기간 안 이벤트 합계이고, delivered는 네임드와 일반 납품을 합친 수이다 */
  bountyFunnel: {
    namedAccepts: number; tickets: number; duelsWon: number; duelsLost: number;
    generalAccepts: number; delivered: number;
  };
  /** 이상 탐지. fastGaps는 캐치 간격 2초 미만 건수, fastUsers는 그 사용자 수, perfectPct는 캐치 중 PERFECT 백분율이다. 캐치가 없으면 perfectPct는 null이다 */
  anomalies: { fastGaps: number; fastUsers: number; perfectPct: number | null };
  /** 명성 게이트 정체. 다음 배를 살 골드는 있으나 명성이 모자란 사용자를 다음 배 단계별로 센 값이다 */
  fameGateStuck: { nextBoat: number; users: number }[];
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
  /** 밸런스 라이브 지표. days는 이벤트 지표의 기간(1~7일)이고, 생략하면 서버 기본값인 7일이다 */
  balanceLive(days?: number): Promise<BalanceLive>;
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
