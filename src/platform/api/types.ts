// API 계약 — 화면과 기능은 이 타입을 사용하고 adapters/가 HTTP·로컬 구현을 제공한다.
import type { GameAction, ActionResult } from '../../game/rules/actions';
import type { RejectReason } from '../../game/rules/rules';
import type { GameState } from '../../game/rules/logic';
import type { DailyFortune, FortuneKind } from '../../game/rules/fortune';
import type { ChatLine } from '../../game/rules/live';
import type { GuildBonusId, GuildEffects, GuildJoinMode, GuildLogKind, GuildRole } from '../../game/rules/guild';
import type { BountyKind } from '../../game/content/bounties';
import type { MaybePromise } from '../../shared/lib/when';

export type { MaybePromise } from '../../shared/lib/when';

export type DispatchResult =
  | { status: 'ok'; state: GameState; result: ActionResult }
  | { status: 'rejected'; error: RejectReason };

/** 표시용 프로필 읽기 결과. 닉네임은 정하지 않았으면 null, 읽기 실패는 ok: false로 구분한다 */
export type GameProfile = { ok: true; nickname: string | null; devTools: boolean } | { ok: false };

/** 게임 상태의 읽기·액션 처리 경계. HTTP와 로컬 구현은 adapters/에 둔다. */
export interface GameGateway {
  load(): MaybePromise<GameState | null>;
  dispatch(action: GameAction): MaybePromise<DispatchResult>;
  getProfile(): MaybePromise<GameProfile>;
  warmup?(): void;
}

/** 세션 확인의 결과. 확인 실패(네트워크 오류, 요청 과다, 서버 오류)는 게스트와 구분한다 */
export type AccountLookup = { status: 'account'; email: string } | { status: 'guest' } | { status: 'failed' };

export type AuthResult = { ok: true } | { ok: false; msg: string; code?: string };

/** 계정의 이용약관 수락 상태. 확인이 필요한 계정이면 required가 true다 */
export interface ConsentStatus {
  required: boolean;
  version: string;
  effectiveAt: string;
}

export type AcceptConsentError =
  | 'consent-version-mismatch'
  | 'account-only'
  | 'unauthorized'
  | 'bad-request'
  | 'rate-limited'
  | 'network'
  | 'server'
  | 'bad-response';

export type AcceptConsentResult =
  | { ok: true; consent: ConsentStatus }
  | { ok: false; code: AcceptConsentError | (string & {}); status?: number };

export interface AuthApi {
  isConfigured: boolean;
  ensureSession(): Promise<string | null>;
  /** 로그인된 영구 계정을 확인한다. 게스트와 확인 실패를 구분해 돌려준다 */
  currentAccount(): Promise<AccountLookup>;
  getSession(): Promise<{ uid: string | null; email: string | null }>;
  /** 현재 계정의 이용약관 수락 상태를 조회한다 */
  getAccountConsent(): Promise<ConsentStatus>;
  /** 확인 화면에서 현재 판의 이용약관을 수락한다 */
  acceptConsent(version: string): Promise<AcceptConsentResult>;
  /** 구글 인증 화면으로 이동한다. 연결(link)은 지금 계정에 구글을 붙이고, 로그인(sign-in)은 이미 연결된 구글 계정으로 들어간다. 표지(tag)는 돌아온 주소에 실린다 */
  startGoogle(start: 'link' | 'sign-in', tag: string): Promise<AuthResult>;
  /** 구글 인증에서 돌아왔는가. 표지와 오류 코드를 돌려준다. 부팅 때 한 번 읽는다 */
  takeGoogleLanding(): { tag: string; error: string | null } | null;
  signOut(): Promise<void>;
  /** 본인 계정과 진행을 지운다. 성공하면 세션도 끝낸다 */
  deleteAccount(): Promise<AuthResult>;
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
export interface MailItemAttachment {
  id: string;
  qty: number;
}

/** 우편 한 통 — 골드와 첨부 아이템이 모두 없으면 글만 있는 우편이다. 시각은 ISO 문자열 */
export interface MailItem {
  id: number; title: string; body: string; gold: number;
  items: MailItemAttachment[];
  createdAt: string; readAt: string | null; claimedAt: string | null;
}

/** 친구 목록 한 줄 — 친구, 받은 요청, 보낸 요청. 접속 여부와 바다는 친구에게만 붙는다 */
export interface FriendItem {
  uid: string; nick: string | null; state: 'friend' | 'incoming' | 'outgoing';
  lastActiveAt: string | null; online: boolean; region: string | null;
  /** 지금 있는 해역(접속 중이고 바다에 있을 때) */
  zone: string | null;
}
export type FriendOp = { op: 'request'; nickname: string } | { op: 'accept' | 'remove'; uid: string };
/** 친구 요청 결과 — 실패는 서버 오류 코드(not-found, self, account-only 등) */
export type FriendOpResult = { ok: true; result: string } | { ok: false; error: string };

export interface GuildMemberItem {
  uid: string; nick: string | null; role: GuildRole; joinedAt: string;
  /** 떠난 시각. 지금 길드원이면 null */
  leftAt: string | null;
  /** 실시간 채널에 접속해 있는가(떠난 선원은 항상 false) */
  online: boolean;
  /** 이 길드에 쌓은 기여 — 누적과 오늘(게임 날짜) */
  contribution: { total: number; today: number };
}
/** 항해일지 한 줄. detail은 전설 획득이면 어종 id, 네임드 토벌이면 의뢰 id, 기부·단계 상승이면 보너스 id다.
 *  value는 기부면 골드, 단계 상승이면 새 단계다 */
export interface GuildLogItem {
  id: number; kind: GuildLogKind; uid: string; nick: string | null; detail: string | null; value: number | null; at: string;
}
/** 길드 보너스 하나 — 해금 레벨, 기본 단계(열리면 최소 1), 자유 강화 단계(0~5), 합산 단계, 기본 상한(최대 5),
 *  다음 기본 단계를 향해 모인 골드와 비용, 합산 효과·다음 합산 효과, 내가 이 보너스에 기부한 골드 */
export interface GuildBonusItem {
  id: GuildBonusId; unlock: number; rank: number; enhanceRank: number; totalRank: number;
  cap: number; pool: number; next: number | null;
  effect: number; nextEffect: number | null; mine: number;
}
/** 기부 순위 한 줄 — 보너스를 합친 사람별 전체 기부액. 지운 계정은 uid가 null이다 */
export interface GuildDonorItem { uid: string | null; nick: string | null; gold: number }
/** 가입 신청 한 줄 — 신청한 사람과 신청 시각 */
export interface GuildJoinRequestItem { uid: string; nick: string | null; requestedAt: string }
/** 내 길드 — members는 지금 길드원(길드장 먼저)과 떠난 선원(최근에 떠난 순). requests는 길드장에게만 차 있다 */
export interface GuildInfo {
  id: string; name: string; createdAt: string; role: GuildRole;
  /** 마지막으로 이름을 바꾼 시각. 바꾼 적이 없으면 null */
  renamedAt: string | null;
  members: GuildMemberItem[];
  /** 바뀌지 않는 고유 코드(초대 링크와 코드 입력에 쓴다), 가입 방식, 초대 링크의 권유 문구(비었으면 null) */
  code: string;
  joinMode: GuildJoinMode;
  pitch: string | null;
  requests: GuildJoinRequestItem[];
  /** 성장 — 누적 기여도, 레벨, 지금 레벨의 시작 문턱과 다음 문턱(최대 레벨이면 null) */
  growth: { level: number; total: number; floor: number; next: number | null };
  /** 보너스 다섯(해금 순)과 서버가 액션에 적용하는 효과, 전체 기부 순위(많은 순) — 화면은 표시만 한다 */
  bonuses: GuildBonusItem[];
  effects: GuildEffects;
  /** 내 계정 기준 자유 강화 누적 초기화 횟수 */
  enhanceResetCount: number;
  donors: GuildDonorItem[];
  /** 항해일지 — 최근 순 */
  logbook: GuildLogItem[];
}
/** 길드가 없을 때 내가 넣어 둔 가입 신청 */
export interface GuildMyRequest { code: string; name: string; requestedAt: string }
/** 내 길드 조회 결과 — 길드가 있으면 request는 null이다 */
export interface GuildState { guild: GuildInfo | null; request: GuildMyRequest | null }
/** 초대 링크 미리보기 — 로그인 없이 읽는 길드 요약 */
export interface GuildInvitePreview { code: string; name: string; level: number; members: number; cap: number; joinMode: GuildJoinMode }
/** 공개 길드 목록 한 줄 — 자유 가입·비만석 길드 요약(고유 코드 비노출) */
export interface PublicGuildItem {
  guildId: string; name: string; level: number; members: number; cap: number; pitch: string; lastActivityAt: string;
}
export type GuildOp =
  | { op: 'create'; name: string }
  | { op: 'join'; code: string; via?: 'link' }
  | { op: 'joinPublic'; guildId: string }
  | { op: 'rename'; guildId: string; name: string }
  | { op: 'settings'; guildId: string; joinMode?: GuildJoinMode; pitch?: string | null }
  | { op: 'approve'; guildId: string; uid: string }
  | { op: 'reject'; guildId: string; uid: string }
  | { op: 'cancelRequest' }
  | { op: 'remove'; guildId: string; uid: string }
  | { op: 'handover'; guildId: string; uid: string }
  | { op: 'donate'; guildId: string; bonus: GuildBonusId; amount: number }
  | { op: 'enhance'; guildId: string; bonus: GuildBonusId }
  | { op: 'resetEnhancements'; guildId: string };
/** 길드 요청 결과 — 들어오기는 바로 들어갔는지(joined) 신청이 됐는지(requested)를, 자유 강화 초기화는 잔여 골드·회수 포인트·누적 초기화 횟수를 싣는다. 실패는 서버 오류 코드 */
export type GuildOpResult =
  | { ok: true; result?: 'joined' | 'requested'; gold?: number; recovered?: number; enhanceResetCount?: number }
  | { ok: false; error: string };

export type RankingBoardId = 'fame' | 'dex' | 'variant' | 'named' | 'namedClears' | 'species';
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

/** 점괘첩 누적 발견 점괘 한 종의 집계 — kind, 강도(3|5), 누적 횟수, 처음 만난 날(YYYY-MM-DD) */
export interface FortuneDiscoveredEntry {
  kind: FortuneKind;
  index: 3 | 5;
  count: number;
  firstDay: string;
}

/** 월별 운세 이력 — 조회 월(YYYY-MM), 최초 기록 월, 서버 기준 오늘 게임 날짜, 오늘의 운세, 해당 월의 일별 운세 목록(오름차순), 누적 발견 점괘 목록 */
export interface FortuneHistory {
  month: string;
  firstMonth: string | null;
  currentDay: string;
  today: DailyFortune | null;
  days: DailyFortune[];
  discovered: FortuneDiscoveredEntry[];
}

// ---------- 관리자 읽기 API (서버 읽기 함수, 읽기 전용) ----------
// 행 타입 = 서버 읽기 함수가 돌려주는 행의 컬럼명이 곧 계약이다(관리자 뷰의 컬럼명과 같다).
// 소비처(admin/**)는 이 인터페이스만 알고 요청 이름·세션 토큰 같은 전송 상세는 http 구현 안에 갇힌다.
// local 구현은 "클라우드 미설정"이라 데이터가 존재하지 않는다 — 접근 판정만 'local'을
// 주고 나머지는 reject한다(조용한 빈 배열은 거짓말이라).

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  /** 닉네임(profiles). 정하지 않았으면 null */
  nickname: string | null;
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
  /** 마지막 접속 세션이 끝난 시각. 세션 기록이 없으면 null */
  last_session_at: string | null;
  /** 접속 세션 길이의 합(초) */
  total_session_sec: number;
}

/**
 * 지금 실시간 채널에 연결된 사람 한 명. nick은 채팅 이름, nickname은 프로필 닉네임(정하지 않았으면 null)이고,
 * email은 게스트이거나 인증 계정이 없으면 null이다. region·zone은 마지막으로 알린 위치이고, connectedAt은 연결 시각(ISO)이다
 */
export interface AdminLiveConnection {
  uid: string; nick: string; nickname: string | null; email: string | null;
  region: string | null; zone: string | null; connectedAt: string; guest: boolean;
}
/** 지금 실시간 채널에 연결된 수와 목록 */
export interface AdminLive { count: number; online: AdminLiveConnection[] }
/**
 * 하루(KST) 집계 한 행. 집계하지 않은 날은 행이 없다.
 * sessionMinutes는 그날 세션 길이의 합(분), medianSessionMinutes는 중앙값(세션이 없으면 null)이다
 */
export interface AdminDailyStatsRow {
  day: string; dau: number; newUsers: number; newAccounts: number;
  sessions: number; sessionMinutes: number; medianSessionMinutes: number | null;
  catches: number; goldIn: number; goldOut: number; actions: number;
}
/** 가입일 코호트 리텐션. day는 가입일(KST), d1·d7·d30은 0~1 비율이고 아직 그날이 오지 않았으면 null이다 */
export interface AdminRetentionRow {
  day: string; size: number; d1: number | null; d7: number | null; d30: number | null;
}
/** 끝난 접속 세션 한 건. 시각은 ISO 문자열이다 */
export interface AdminSessionRow {
  id: number; userId: string; nick: string | null;
  startedAt: string; endedAt: string; durationSec: number;
}
export interface AdminEconomyRow {
  day: string; sells: number; sell_gold: number; coupon_gold: number; mail_gold: number;
  bounty_gold: number; achievement_gold: number;
  rod_cost: number; boat_cost: number; hat_cost: number;
}
/** 바운티 퍼널 일계 — 네임드 수주 → 흔적(도전권) → 결투 승·패 → 토벌 보상, 일반 수주·납품 */
export interface AdminBountyFunnelRow {
  day: string; named_accepts: number; tickets: number; duels_won: number; duels_lost: number;
  named_rewards: number; general_accepts: number; general_rewards: number;
}
export interface AdminSpamFlagRow {
  user_id: string; catches_7d: number; fast_gap_7d: number;
  perfect_pct: number | null; perfect_pct_global: number | null;
}
export interface AdminEventRow {
  id: number; user_id: string; type: string;
  payload: Record<string, unknown>; created_at: string;
}
export interface AdminLetterRow {
  id: number; user_id: string; text: string; created_at: string;
  /** 관리자가 처리 표시한 시각. 처리 전이면 null */
  handled_at: string | null;
}
/** 변경 기록 한 건. tier는 public(플레이어에게도 보이는 변경)과 admin(관리자만 보는 변경)이다 */
export interface AdminChangelogRow {
  id: string; version: string;
  /** 그 버전을 올린 날(KST 날짜) */
  date: string; seq: number; tier: 'public' | 'admin'; tag: string; text: string;
  /** 체인지로그에서 사라지거나 다른 항목에 대체돼 철회로 표시된 시각. 평소 null */
  withdrawnAt: string | null;
}
/** 채팅 신고 한 건. user_id는 신고한 사람, target_id는 신고당한 메시지의 보낸 사람이다 */
export interface AdminChatReportRow {
  id: number; user_id: string; message_id: number; target_id: string;
  /** 신고한 메시지와 앞뒤 대화의 복사본(오래된 순) */
  lines: ChatLine[];
  created_at: string;
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
  /** 도감 진행. 일반 폼을 하나 이상 발견한 사용자의 발견 어종 수 분포이다. 10종 구간이고 fromSpecies 120은 120종 이상이다 */
  dexBuckets: { fromSpecies: number; users: number }[];
  /** 배 단계 분포. boat 0은 배가 없는 상태이다 */
  boats: { boat: number; users: number }[];
  /** 낚싯대 레벨 분포. 5레벨 구간이고 fromLevel 66은 66레벨 이상이다 */
  rodBuckets: { fromLevel: number; users: number }[];
  /** 골드 잔고의 25·50·75·90분위와 최대. 사용자가 없으면 모두 null이다 */
  gold: { p25: number | null; p50: number | null; p75: number | null; p90: number | null; max: number | null };
  /** 골드 흐름. 기간 안 유입(판매, 쿠폰, 우편, 현상금, 업적)과 유출(강화, 배, 모자)의 합이다 */
  goldFlow: {
    sellGold: number; couponGold: number; mailGold: number; bountyGold: number; achievementGold: number;
    rodCost: number; boatCost: number; hatCost: number;
  };
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

/** 관리자 판정 — local은 "클라우드 미설정"(권한 실패 아님), signedOut은 관리자 세션 없음, denied는 DB admins 비등록 */
export interface AdminAccessResult {
  kind: 'granted' | 'denied' | 'signedOut' | 'local';
  /** 서버가 확인한 세션 uid. denied 안내("이 uid를 등록하라")에 쓴다 */
  uid: string | null;
}

/** 관리자 — 보낸 우편 한 통(받는 사람 포함) */
export interface AdminSentMailRow extends MailItem { userId: string }
/** 관리자 — 우편 보내기 요청. 대상은 지정 계정별 금액·첨부 또는 전체 플레이어 같은 금액·첨부이다 */
export interface AdminMailRequest {
  title: string; body: string;
  target:
    | { kind: 'users'; recipients: { userId: string; gold?: number; items?: MailItemAttachment[] }[] }
    | { kind: 'all'; gold?: number; items?: MailItemAttachment[] };
  items?: MailItemAttachment[];
  idempotencyKey?: string;
}
/** 관리자 — 우편 미리보기·보내기 결과. problems가 있으면 미리보기가 없고 보내지 않는다 */
export interface AdminMailPlan {
  problems: ('title' | 'body' | 'gold' | 'items' | 'empty' | 'recipients' | 'duplicate' | 'totalGold')[];
  duplicates?: string[];
  preview: {
    count: number;
    recipientCount: number;
    totalGold: number;
    capExceeded: boolean;
    maxTotalGold: number;
    missing: string[];
  } | null;
  /** 보내기에서만 — 넣은 우편 수 */
  sent?: number;
  idempotent?: boolean;
}

/** 관리자 — 대상 플레이어의 게임 상태 상세 스냅샷 */
export interface AdminUserState {
  hasSave: boolean;
  dex: {
    normal: number; normalTotal: number;
    variant: number; variantTotal: number;
    named: number; namedTotal: number;
  };
  bounty: {
    namedClears: number;
    namedDistinctClears: number;
    namedTotal: number;
  };
  artifacts: {
    owned: { id: string; name: string; grade: string | null; level: number | null }[];
    total: number;
  };
  hats: {
    owned: number;
    total: number;
    items: { id: string; name: string; source: 'gold' | 'achievement' }[];
    equipped: { id: string; name: string } | null;
  };
  achievements: {
    claimed: number;
    claimable: number;
    total: number;
    counters: Record<string, number>;
  };
  cooking: {
    energy: { common: number; rare: number; epic: number; legendary: number };
    cooked: { id: string; name: string; kind: 'lunch' | 'bait'; count: number }[];
    inProgress: { id?: string | null; recipe: string; name: string; count: number; startedAt: string } | null;
    queue?: { id: string | null; recipe: string; name: string; count: number }[];
    slots: {
      lunch: { id: string; name: string; endsAt: string } | null;
      bait: { id: string; name: string; endsAt: string } | null;
      bait2?: { id: string; name: string; endsAt: string } | null;
    };
  };
  instances: {
    bag: number;
    exhibit: number;
    recentBag: {
      uid: string;
      fishId: string;
      name: string;
      form: string;
      grade: string | null;
      size: number | null;
      caughtAt: string | null;
      spot: string | null;
      locked: boolean;
    }[];
  };
  progression: {
    visited: string[];
    coupons: string[];
    bountyProgress: { questId: string; zone: string; progress: number; target: number | null; startedAt: string }[];
    bountyTickets: { questId: string; issuedAt: string }[];
    activeSessions: number;
  };
}

/** 관리자 — 개요 탭 통합 응답 */
export interface AdminOverview {
  users: AdminUserRow[];
  recentEvents: AdminEventRow[];
  spamFlags: AdminSpamFlagRow[];
  dailyStats: AdminDailyStatsRow[];
  retention: AdminRetentionRow[];
  sessions: AdminSessionRow[];
  live: AdminLive;
}

/** 앱 서버 HTTP 응답 지표 경로 묶음 */
export type AdminHttpMetricRouteGroup = 'action' | 'auth' | 'admin' | 'api' | 'web';

/** 앱 서버 HTTP 응답 지표 건수·비율(비율은 0~1, total이 0이면 0) */
export interface AdminHttpMetricCounts {
  total: number;
  status426: number;
  status429: number;
  status5xx: number;
  rate426: number;
  rate429: number;
  rate5xx: number;
}

/** KST 일별 HTTP 지표 합계·비율 */
export interface AdminHttpMetricDayRow extends AdminHttpMetricCounts {
  day: string;
}

/** 경로 묶음별 HTTP 지표 합계·비율 */
export interface AdminHttpMetricRouteRow extends AdminHttpMetricCounts {
  routeGroup: AdminHttpMetricRouteGroup;
}

/** 일자·경로 묶음별 HTTP 지표 원본 행 */
export interface AdminHttpMetricRawRow {
  day: string;
  routeGroup: AdminHttpMetricRouteGroup;
  total: number;
  status426: number;
  status429: number;
  status5xx: number;
}

/**
 * 관리자 — 앱 서버 HTTP 오류율·429 지표 응답.
 * 클러스터 앞단(ingress-nginx)에서 직접 차단한 429 응답은 앱 서버에 도달하지 않으므로
 * 앱 서버 통과 요청 기준(scope: 'app_server')이다.
 */
export interface AdminHttpMetrics {
  days: number;
  scope: 'app_server';
  summary: AdminHttpMetricCounts;
  /** KST 날짜 오름차순 일별 추이 */
  daily: AdminHttpMetricDayRow[];
  /** 요청 수 내림차순 경로 묶음별 집계 */
  byRoute: AdminHttpMetricRouteRow[];
  /** KST 날짜 내림차순, 경로 묶음 오름차순 원본 행 */
  rows: AdminHttpMetricRawRow[];
}

/** 게스트 → 구글 전환 소요 시간 구간 */
export type AdminConversionTimeBucketId =
  | 'under_10m'
  | '10m_to_1h'
  | '1h_to_24h'
  | '1d_to_7d'
  | 'over_7d';

/** 게스트 → 구글 전환 소요 시간 구간별 인원과 비율(0~100, 소수 첫째 자리) */
export interface AdminConversionTimeBucket {
  bucket: AdminConversionTimeBucketId;
  count: number;
  pct: number;
}

/** 게스트 → 구글 계정 전환율 및 소요 시간 분포 */
export interface AdminOnboardingConversion {
  totalUsers: number;
  guestUsers: number;
  googleLinkedUsers: number;
  /** 전체 사용자 대비 구글 연결 비율(0~1) */
  conversionRate: number;
  /** 전환 소요 시간 중앙값(분). 전환 사용자가 없으면 null */
  medianMinutes: number | null;
  /** 전환 소요 시간 90분위(분). 전환 사용자가 없으면 null */
  p90Minutes: number | null;
  buckets: AdminConversionTimeBucket[];
}

/** 튜토리얼 4단계 식별자 */
export type AdminTutorialStageId = 'village' | 'sea' | 'bounty-quests' | 'bounty-named';

/** 튜토리얼 단계별 완료·이탈 현황 */
export interface AdminOnboardingTutorialStage {
  id: AdminTutorialStageId;
  completed: number;
  /** 전체 사용자 대비 완료 비율(0~1) */
  rate: number;
  /** 직전 단계 대비 이탈 인원(첫 단계는 0) */
  dropOffFromPrev: number;
  /** 직전 단계 대비 유지 비율(0~1, 첫 단계이거나 직전 인원이 0이면 null) */
  stepRate: number | null;
}

/** 튜토리얼 4단계 완료·이탈 요약 */
export interface AdminOnboardingTutorials {
  totalUsers: number;
  totalWithSave: number;
  stages: AdminOnboardingTutorialStage[];
}

/** 초반 온보딩 6단계 식별자 */
export type AdminOnboardingStepId =
  | 'first_visit'
  | 'tutorial_complete'
  | 'first_catch'
  | 'first_sell'
  | 'first_harbor'
  | 'first_upgrade';

/**
 * 지표 산출 근거 구분.
 * lifetime: 누적 저장 상태(계정·세이브·도감·수배) 정본 기준(최근 7일 이벤트 보조 포함).
 * hybrid_7d: 누적 카운터와 최근 7일 이벤트 합집합(카운터 도입 전 활동은 7일 창 한도 영향).
 */
export type AdminOnboardingStepBasis = 'lifetime' | 'hybrid_7d';

/** 초반 온보딩 6단계 퍼널 단계 한 건 */
export interface AdminOnboardingFunnelStep {
  id: AdminOnboardingStepId;
  users: number;
  /** 전체 사용자 대비 도달 비율(0~1) */
  rate: number;
  /** 직전 단계 대비 전환 비율(0~1, 첫 단계이거나 직전 인원이 0이면 null) */
  stepRate: number | null;
  basis: AdminOnboardingStepBasis;
}

/** 관리자 — 온보딩 퍼널 응답 */
export interface AdminOnboardingFunnel {
  /** 이벤트 보조 신호의 조회 창(일, 7일 고정) */
  eventsWindowDays: number;
  conversion: AdminOnboardingConversion;
  tutorials: AdminOnboardingTutorials;
  steps: AdminOnboardingFunnelStep[];
}

export interface AdminApi {
  /** 관리자 로그인이 필요한 클라우드 구현인가. 로컬 모드는 false다 */
  isConfigured: boolean;
  access(): Promise<AdminAccessResult>;
  /** 구글 인증 화면으로 이동해 관리자 세션을 연다. 게임 세션과 쿠키가 따로다 */
  signIn(): Promise<AuthResult>;
  /** 구글 로그인에서 돌아왔는가. 서버가 돌려준 결과 코드를 담고 오류가 없으면 error는 null이다. 이 탭에서 시작한 흐름이 아니면 null이다. 빈 문자열 오류 코드도 오류 없음과 구분해 실패로 돌려준다. 읽으면 주소에서 지운다. 복귀 표지 질의 없이 읽어도 남은 세션 저장소 표지는 지우고 null을 돌려준다 */
  takeSignInReturn(): { error: string | null } | null;
  /** 관리자 세션만 끝낸다. 게임 세션은 그대로다 */
  signOut(): Promise<void>;
  /** 개요 탭 통합 조회. days를 생략하면 서버 기본 기간(30일)이다 */
  overview(days?: number): Promise<AdminOverview>;
  users(): Promise<AdminUserRow[]>;
  /** 지금 실시간 채널에 연결된 사람 */
  live(): Promise<AdminLive>;
  /** from~to(KST 날짜, 양끝 포함)의 일별 집계. 집계하지 않은 날은 빠진다 */
  dailyStats(from: string, to: string): Promise<AdminDailyStatsRow[]>;
  /** 가입일 코호트 리텐션 */
  retention(): Promise<AdminRetentionRow[]>;
  /** 끝난 접속 세션(최근 순). userId를 주면 그 사람의 기록만 */
  sessions(userId?: string, limit?: number): Promise<AdminSessionRow[]>;
  economy(days: number): Promise<AdminEconomyRow[]>;
  bountyFunnel(days: number): Promise<AdminBountyFunnelRow[]>;
  /** 온보딩 퍼널(게스트→구글 전환·튜토리얼 4단계·초반 6단계 도달률) */
  onboardingFunnel(): Promise<AdminOnboardingFunnel>;
  /** 앱 서버 HTTP 오류율·429 지표. days(1~90)를 생략하면 서버 기본 기간(30일)이다 */
  httpMetrics(days?: number): Promise<AdminHttpMetrics>;
  spamFlags(): Promise<AdminSpamFlagRow[]>;
  recentEvents(): Promise<AdminEventRow[]>;
  userEvents(userId: string, limit?: number): Promise<AdminEventRow[]>;
  userState(uid: string): Promise<AdminUserState>;
  letters(): Promise<AdminLetterRow[]>;
  /** 변경 기록(최신 버전부터, 철회된 항목 포함) */
  changelog(): Promise<AdminChangelogRow[]>;
  /** 채팅 신고 목록(최근 순) */
  chatReports(): Promise<AdminChatReportRow[]>;
  /** 최근 보낸 우편 */
  sentMails(): Promise<AdminSentMailRow[]>;
  /** 우편 미리보기(preview, 쓰지 않음) 또는 보내기(send) */
  mail(op: 'preview' | 'send', request: AdminMailRequest): Promise<AdminMailPlan>;
  /** 계정 제재(true) 또는 해제(false). 저장 상태가 없는 계정은 실패한다 */
  restrict(userId: string, restricted: boolean): Promise<{ restricted: boolean }>;
  /** 편지 처리 표시(true) 또는 취소(false) */
  letterHandled(letterId: number, handled: boolean): Promise<{ handled: boolean }>;
  /** 대상 계정의 활성 인증 세션을 모두 강제 종료한다 */
  revokeSessions(userId: string): Promise<{ revoked: number }>;
  /** 밸런스 라이브 지표. days는 이벤트 지표의 기간(1~7일)이고, 생략하면 서버 기본값인 7일이다 */
  balanceLive(days?: number): Promise<BalanceLive>;
  /** 이 화면이 붙은 배포 주소의 호스트 — 운영/스테이징 착오 방지 표시값(Ops 탭). 로컬 모드는 null */
  deployHost(): string | null;
}

export type PromoteTestResult =
  | { ok: true; email: string; isAnonymous: false }
  | { ok: false; msg: string; code?: string };

export interface ResetDevAccountResult {
  state: GameState;
  version: number;
}

/** 스테이징·로컬 개발 계정 도구 API. 운영 환경에서는 서버가 404로 차단한다 */
export interface DevApi {
  /** 현재 게스트 계정의 세이브를 유지한 채 스테이징 테스트 정식 계정으로 승격한다 */
  promoteTestAccount(): Promise<PromoteTestResult>;
  /** 현재 계정의 세이브·수배·업적·운세를 초기 상태로 되돌린다 */
  resetDevAccount(): Promise<ResetDevAccountResult>;
}

export interface ApiClient {
  /** 게임 상태 게이트웨이 생성. LocalGameGateway가 상태를 소유하므로 마운트마다 새로 만든다. */
  createGameGateway(initial: GameState): GameGateway;
  auth: AuthApi;
  storage: StorageApi;
  admin: AdminApi;
  dev: DevApi;
}
