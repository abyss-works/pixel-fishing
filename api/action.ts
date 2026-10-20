// 액션 API — 모든 상태 변경의 유일한 서버 경로 (서버 권위 v0.5.0, Vercel Function, Node 런타임)
// 규칙 실행은 applyAction — 클라이언트 LocalGameGateway와 같은 리듀서.
// 저장 모델(0005): saves_current(유저당 1행, 낙관 락) + events(append-only 정본 스트림)
// + saves(스냅샷 아카이브 — 50액션마다 append, 롤백 안전망).
// DB는 Postgres 직접 연결(DATABASE_URL)로 읽고 쓴다. 표마다 쓰기를 맡는 저장 모듈이 하나씩 있고,
// 이 파일은 읽기 → 규칙 실행 → 확정 → 응답의 순서만 조율한다. 인증 서버 조회만 supabase-js를 쓴다.
//
// 왕복 순서: 상태 읽기 1회 → (캐치면 도감·가방 수 1회, 가방이 가득 차면 방생 후보 1회) → 확정 1회 → 응답.
// 이벤트·주기 스냅샷·의뢰 진행도처럼 유실을 허용하는 쓰기는 응답 뒤에 한 번에 실행한다.
//
// ⚠️ 시그니처는 Node 스타일(req, res)만 쓴다 — Web 표준 시그니처로 배포했다가 전부 500 났던
// 사고(2026-08-21) 재발 방지. default export = Node 시그니처.
import { createClient } from '@supabase/supabase-js';
import type { SQL } from 'drizzle-orm';
import { waitUntil } from '@vercel/functions';
import type { IncomingMessage, ServerResponse } from 'node:http';
// 확장자(.js) 필수 — Node 순수 ESM 로더가 src 모듈을 그대로 import한다
import { migrate, newState } from '../src/game/rules/logic.js';
import type { FishInstance, FormRecord, GameState } from '../src/game/rules/logic.js';
import {
  buildCatchInfo, canFish, capOfBoat, FISH, formName, instanceFish,
  makeInstance, nextDexRec, pickEvict, RARITY, RARITY_ORDER, rollCatchExtras,
  takeItem, matchBountyCatch, rollNamedEncounter, mutationWeightsOf,
} from '../src/game/rules/logic.js';
import { bountyById, dailyQuestFor } from '../src/game/content/bounties.js';
import type { SpotId } from '../src/game/content/spots.js';
import { applyAction, pickScalars, prepareCatchDraw, rollCatchFish } from '../src/game/rules/actions.js';
import type { ActionDeps, ApplyOutcome, GameEvent, ReleasedFish, StatePatch } from '../src/game/rules/actions.js';
import type { BountyCtx } from '../src/game/rules/rules.js';
import { parseAction } from '../src/game/rules/actionSchema.js';
import { isDebugTableCommand } from '../src/game/rules/debug.js';
import type { DebugTableCommand } from '../src/game/rules/debug.js';
import { expiredTicketIssuedAt } from '../src/game/rules/challenge.js';
import { clearsOf, splitQuestRows } from '../src/game/rules/bountyRows.js';
import type { QuestRow } from '../src/game/rules/bountyRows.js';
import { gameDayOf, gameDayStartISO } from '../src/game/rules/time.js';
import { checkNickname, pickGuestName } from '../src/game/rules/nickname.js';
import { powerZones, rodPower } from '../src/game/rules/stats.js';
import { SPOTS } from '../src/game/content/spots.js';
import { MIN_ACTION_GAP_MS, MIN_ACTION_GAP_FAST_MS, PACING_SLOW_TYPES, SNAPSHOT_EVERY } from '../src/game/rules/balance.js';
import { APP_VERSION } from '../src/version.js';
import { bearerToken, verifyJwtLocal } from './_auth/session.js';
import { database } from './_db/client.js';
import type { Executor } from './_db/client.js';
import {
  acceptFragments, advanceProgress, challengeFragments, clearFragment, consumeDelivery, debugFragment,
  expiredCleanup, ticketFragment,
} from './_data/bounty.js';
import { consumeRelief, findCoupon } from './_data/codes.js';
import { COMMIT_GUARD, commitAction, runFollowUps } from './_data/commit.js';
import { catchLookup, evictionCandidates, latestLegacySave, loadContext } from './_data/load.js';
import type { BountyRows, InstanceRow, RecordRow, StateRow } from './_data/load.js';
import { letterFragment } from './_data/mail.js';
import { ensureProfile, nicknameTaken, profileExists, setNickname } from './_data/profile.js';
import { instRow, seedState, snapshotInsert, stateRow, versionUpdate, writeFragments } from './_data/save.js';
import { eventsInsert } from './_data/telemetry.js';

export type { BountyRows } from './_data/load.js';

// 배포 식별자 — vite가 클라 번들에 박는 값과 같은 출처(Vercel 시스템 환경변수).
// 공식 문서 확인: VERCEL_GIT_COMMIT_SHA는 빌드·런타임 양쪽에 제공된다.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
import { reportServerIssue } from './observability.js';
import { ApiError, toApiError } from './errors.js';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (code: number) => Res; json: (body: unknown) => void };

// 이사 코드 import는 소유자 계정만 허용한다.
// 무검증 수입이 변조 반입 통로로 실제 악용됐다(골드 999억·명성 10억 세이브).
// 출처는 서버 env가 정본이다. env가 없으면 폴백으로 동작해 배포가 깨지지 않는다.
// 클라이언트의 OWNER_EMAIL은 관리자 UI 표시용 힌트일 뿐 진짜 경계가
// 아니라서 수동 동기화로 둔다 — 빌드타임 주입은 env 분리(Preview/Production/로컬)가
// 늘어나는 대가라 하지 않는다.
export const OWNER_EMAIL_FALLBACK = 'inley@naver.com';
export function importOwnerEmail(): string {
  return process.env.IMPORT_OWNER_EMAIL ?? OWNER_EMAIL_FALLBACK;
}

// 테스트용 트리거(강제 조우 등) 허용 판정 — 운영 배포는 어떤 경우에도 막는다.
// 스테이징·로컬 서버에서는 소유자 계정이거나 로컬 오리진일 때만 연다.
export function debugTriggerAllowed({ vercelEnv, localOrigin, owner }: {
  vercelEnv: string | undefined; localOrigin: boolean; owner: boolean;
}): boolean {
  if (vercelEnv === 'production') return false;
  return localOrigin || owner;
}

/** 개발 도구 테이블 명령 → 본인 행에 대한 쓰기 계획. 시각 기준은 도전권 판정·일일 한도와 같은 함수를 쓴다 */
export type DebugTablePlan =
  | { table: string; op: 'delete'; since?: { column: string; iso: string } }
  | { table: string; op: 'update'; values: Record<string, unknown> };
export function debugTablePlan(command: DebugTableCommand, nowMs: number): DebugTablePlan {
  switch (command) {
    case 'bounty.expireTickets':
      return { table: 'bounty_tickets', op: 'update', values: { issued_at: expiredTicketIssuedAt(nowMs) } };
    case 'bounty.clearTickets':
      return { table: 'bounty_tickets', op: 'delete' };
    case 'bounty.resetToday':
      return { table: 'bounty_clears', op: 'delete', since: { column: 'cleared_at', iso: gameDayStartISO(new Date(nowMs).toISOString()) } };
    case 'bounty.clearProgress':
      return { table: 'bounty_progress', op: 'delete' };
  }
}

// 첫 조우일은 유저 체감 날짜 — 서버는 UTC라 KST(UTC+9)로 고정 계산 (친구 그룹 전원 한국).
// 달력 날짜다. 바운티 헌팅의 하루(의뢰 배정·만료·클리어 한도)는 04:00 경계의 게임 날짜를 쓴다(gameDayOf).
const todayKST = (): string => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 3소스 → GameState 조립 */
function assemble(row: StateRow, instances: InstanceRow[], records: RecordRow[]): GameState {
  const bag: FishInstance[] = [];
  const exhibit: FishInstance[] = [];
  for (const r of instances) {
    const inst: FishInstance = {
      uid: r.uid, fishId: r.fish_id, form: r.form as FishInstance['form'],
      size: r.size, caughtAt: r.caught_at, spot: r.spot as FishInstance['spot'],
      judgment: r.judgment as FishInstance['judgment'],
      locked: r.locked === true,
    };
    if (r.slot === null || r.slot === undefined) bag.push(inst);
    else exhibit[r.slot] = inst;
  }
  const dex: GameState['dex'] = {};
  for (const r of records) {
    (dex[r.fish_id] ??= {})[r.form as keyof GameState['dex'][string]] =
      { count: Number(r.count), maxSize: r.max_size, first: r.first_caught?.slice(0, 10) ?? null };
  }
  // blob에 남은 나머지(coupons·locked 등)를 얹고 migrate로 위생 처리
  return migrate({ ...(row.data as object), v: 8, gold: Number(row.gold), fame: Number(row.fame),
    boat: row.boat, rod: row.rod, bag, exhibit, dex });
}

/** 진행 행(DB 표기) → 판정 함수의 입력 */
const questRows = (rows: BountyRows): QuestRow[] =>
  rows.progress.map(p => ({ questId: p.quest_id, progress: Number(p.progress), startedAt: p.started_at }));

/** DB 행 → 리듀서 주입 진실. 하루의 시작 이전에 수주하고 마치지 못한 의뢰는 없는 것으로 친다(진행도·도전권 포함).
 *  마쳐서 보상을 받을 수 있는 의뢰는 날이 바뀌어도 남는다. 미등록 의뢰 행은 무시한다.
 *  클리어는 갈래별로 센다 */
export function toBountyCtx(rows: BountyRows, dayStartISO: string): BountyCtx {
  const { live } = splitQuestRows(questRows(rows), dayStartISO);
  const liveIds = new Set(live.map(r => r.questId));
  return {
    clearsToday: clearsOf(rows.clears.map(c => ({ kind: c.kind, clearedAt: c.cleared_at })), dayStartISO),
    tickets: rows.tickets.filter(t => liveIds.has(t.quest_id)).map(t => ({
      questId: t.quest_id, issuedAt: t.issued_at,
    })),
    complete: live.filter(r => r.progress >= bountyById(r.questId)!.count).map(r => r.questId),
    active: live.map(r => r.questId),
  };
}

/** 정리할 만료 의뢰 — 의뢰 id와 수량(SQL이 같은 조건을 다시 걸 때 쓴다) */
export function expiredQuests(rows: BountyRows, dayStartISO: string): { id: string; count: number }[] {
  return splitQuestRows(questRows(rows), dayStartISO).expired
    .map(r => ({ id: r.questId, count: bountyById(r.questId)!.count }));
}

/** 개체·도감 스킵 — 이 액션들의 리듀서는 스칼라/blob만 건드린다(가방·도감 무접촉 검증됨):
 * boot/sendLetter/setNickname(상태불변) · upgradeRod/buyBoat/travel/redeemCoupon(스칼라만).
 * debug는 도감 명령(dex.completeZone)이 있어 스킵하지 않는다.
 * deliverBounty는 서버 주입 완료 여부만 보니 스킵 유지.
 * acceptQuest는 라이선스 도감 판정을 상태로 보므로(records 필요) 스킵 금지 —
 * 스킵하면 dex가 빈 채로 조립되어 도감과 무관하게 dex-incomplete 422가 된다.
 * 회귀 가드는 acceptQuest가 이 경로에 포함되지 않음을 검증한다. */
export const SKIP_DETAIL = new Set([
  'boot', 'sendLetter', 'upgradeRod', 'buyBoat', 'travel', 'redeemCoupon', 'catch',
  'setNickname', 'deliverBounty', 'exchangeArtifact',
]);

/** 수배 진실이 필요한 액션 — 라이선스·일일 카운트·진행도·도전권은 전용 표에 있다 */
const BOUNTY_ACTIONS = new Set(['acceptQuest', 'deliverBounty', 'resolveChallenge', 'catch']);

// 액션 페이싱 게이트(2단계) — 서버 추첨으로 가치를 생성하는 catch와 쓰기 비용이 큰 letter는
// 느린 창(1s), 상점·정비 등 UI 체인이 정상인 나머지는 빠른 창(150ms)을 쓴다. 봇 flood에는
// 빠른 창도 완화 상한으로 남는다(~6.7 rps/uid). 밸런스 상수와 액션 목록은 각 정의를 단일 출처로 삼는다.
const PACING_SLOW = new Set<string>(PACING_SLOW_TYPES);

/** DB 단계 실행 — 실패는 그 단계의 오류 코드로 500을 던진다 */
async function step<T>(code: 'db-read' | 'db-write' | 'db-seed', context: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(500, code, context, { cause: e });
  }
}

export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    await route(req, res);
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    res.status(err.status).json({ error: err.code, ...err.context.body as object });
  }
}

async function route(req: Req, res: Res): Promise<void> {
  // GET = 워밍/헬스 핑 (클라 캐스팅 워밍 + 업타임 모니터 대상) — 204는 브라우저 콘솔에
  // 에러로 찍히지 않는다 (405를 주면 캐스팅마다 콘솔 노이즈).
  if (req.method === 'GET') { res.status(204).end(); return; }
  if (req.method !== 'POST') throw new ApiError(405, 'method-not-allowed');

  // 낡은 탭 차단 — **배포 단위**로 판정한다. APP_VERSION은 릴리즈 라벨이라 dev 빌드에서
  // 올라가지 않아(roadmap 0.0) 개발·스테이징 배포 사이에서는 영원히 일치했다.
  // 클라는 빌드 시 번들에 박힌 값을, 서버는 런타임 env를 읽는다 — 같은 배포면 같은 값이다.
  // 인증/리듀서보다 먼저: 새 서버의 결과를 낡은 번들이 해석 못 해 깨지는 것을 원천 차단하고,
  // 클라이언트는 업데이트 모달(새로고침 안내)을 띄운다. 헤더 부재 = 기능 도입 전 구버전 → 동일 처리.
  if (req.headers['x-build-id'] !== BUILD_ID) {
    throw new ApiError(426, 'version-mismatch', { body: { server: APP_VERSION } });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.DATABASE_URL) throw new ApiError(500, 'server-config');
  const { db, withTransaction } = database();

  // 인증 서버 조회 전용 — DB 읽기·쓰기는 하지 않는다
  const auth = createClient(url, serviceKey, { auth: { persistSession: false } }).auth;

  // 유저 확인 — JWT secret이 있으면 로컬 검증(왕복 0), 없으면 Auth 서버 조회 폴백
  const token = bearerToken(req.headers.authorization);
  let uid: string;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    const sub = verifyJwtLocal(token, jwtSecret);
    if (!sub) throw new ApiError(401, 'unauthorized');
    uid = sub;
  } else {
    const { data: userData, error: authError } = await auth.getUser(token);
    if (authError || !userData.user) throw new ApiError(401, 'unauthorized');
    uid = userData.user.id;
  }

  // 프로필 보장 — 행이 없으면 게스트명을 지어 넣는다 (첫 액션 1회).
  // 표시용 읽기는 클라가 RLS 본인 읽기로 가져간다.
  const ensureGuestName = async () => {
    const ok = await step('db-write', { uid, action: 'profile' }, () => ensureProfile(db, uid, i => {
      const base = pickGuestName(Math.random);
      return i === 0 ? base : `${base}_${i + 1}`;
    }));
    if (!ok) throw new ApiError(500, 'db-write', { uid, action: 'profile' });
  };

  // body = GameAction (content-type: application/json이면 Vercel이 파싱해 둔다).
  // 런타임 검증은 actionSchema가 맡는다 — type 화이트리스트와 judgment enum을 여기서
  // 잠그지 않으면 미지 문자열이 NaN 가중합 → 풀末尾 전설 확정으로 이어진다.
  let body: unknown = req.body ?? null;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const parsed = parseAction(body);
  if (!parsed) {
    if (!await step('db-read', { uid }, () => profileExists(db, uid))) await ensureGuestName();
    throw new ApiError(400, 'bad-action');
  }
  let action = parsed;

  // 현재 상태 로드 — 프로필·저장 상태와, 필요한 액션이면 개체·도감·수배 행까지 한 번에 읽는다.
  // boot/sendLetter는 상태 참조를 그대로 반환해 게임 상태를 바꾸지 않는다.
  // 그래서 개체·도감 조회가 불필요하고, 응답 델타도 빈 writes다. 스냅샷 경계 버전에서는
  // 풀 조회로 돌아간다 (saves 아카이브는 풀 스냅샷이 계약이라 빈 가방 스냅샷을 남기면 안 된다).
  const wantsBounty = BOUNTY_ACTIONS.has(action.type)
    && (action.type === 'catch' || typeof (action as { questId?: unknown }).questId === 'string');
  // 하루의 경계 — 의뢰 배정·만료·클리어 한도가 모두 이 게임 날짜(KST 04:00)를 쓴다. 한 요청 안에서는 한 시각으로 정한다
  const requestISO = new Date().toISOString();
  const dayStart = gameDayStartISO(requestISO);
  const loaded = await step('db-read', { uid, action: action.type }, () => loadContext(db, uid, {
    skipDetailType: SKIP_DETAIL.has(action.type), snapshotEvery: SNAPSHOT_EVERY,
    bountyDayStart: wantsBounty ? dayStart : null,
  }));
  if (loaded.nickname === null) await ensureGuestName();

  // 호출자 판정 — 로컬 오리진(vite dev가 실제로 이 함수를 치는 빌드)과 소유자 계정.
  // JWT 로컬 검증 경로는 email을 안 봤으니 필요할 때만 Auth 서버에 물어본다.
  // 오프라인 dev(LocalGameGateway)는 애초에 이 함수에 도달하지 않는다.
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.origin ?? ''));
  const isOwner = async (): Promise<boolean> => {
    const { data: ud } = await auth.getUser(token);
    return (ud.user?.email?.toLowerCase() ?? '') === importOwnerEmail().toLowerCase();
  };
  const debugAllowed = async (): Promise<boolean> => {
    const vercelEnv = process.env.VERCEL_ENV;
    if (vercelEnv === 'production') return false;
    return debugTriggerAllowed({ vercelEnv, localOrigin, owner: localOrigin || await isOwner() });
  };

  // 이사 코드 import — 무검증 수입이라 골드·명성·도감을 통째로 주입할 수 있었다.
  // 운영에서도 소유자 계정만, 로컬 오리진은 개발 편의상 연다.
  if (action.type === 'import' && !localOrigin && !await isOwner()) {
    throw new ApiError(403, 'import-owner-only');
  }

  // 개발 도구 명령 — 운영 배포는 전부 거부한다. 스테이징·로컬은 소유자·로컬 오리진만.
  // 규칙 거부(422)로 돌려 제재 안내(403 정책)와 섞이지 않게 한다.
  if (action.type === 'debug' && !await debugAllowed()) {
    throw new ApiError(422, 'debug-forbidden');
  }

  // 테스트용 강제 조우 — 허용되지 않으면 표시만 떼어 내고 통상 캐치로 처리한다(거부하지 않는다).
  if (action.type === 'catch' && action.forceEncounter && !await debugAllowed()) {
    action = { type: 'catch', spot: action.spot, judgment: action.judgment };
  }

  let row = loaded.row;
  const snapshotDue = row !== null && (Number(row.version) + 1) % SNAPSHOT_EVERY === 0;
  // 개체·도감 스킵 — 대상은 모듈 상수 SKIP_DETAIL. catch는 아래 fast path가
  // COUNT+피해자1행+도감1행만 읽는다. sell/setLocked/claimRelief/import는 가방·도감을
  // 직접 다루어 풀 유지. 스냅샷 경계 버전은 전부 풀 조회로 복귀
  // (saves 아카이브는 풀 스냅샷이 계약).
  const skipDetail = row !== null && !snapshotDue && SKIP_DETAIL.has(action.type);
  let instances: InstanceRow[] = loaded.instances ?? [];
  let records: RecordRow[] = loaded.records ?? [];

  // 행이 없으면 구 saves(아카이브) 최신 blob에서 1회 시딩 = 정규화 이관 지점.
  if (!row) {
    const old = await step('db-read', { uid }, () => latestLegacySave(db, uid));
    const seed = migrate(old ?? newState());
    const seeded = await step('db-seed', { uid }, () => seedState(withTransaction, uid, seed, new Date().toISOString()));
    if (!seeded) { // 동시 첫 액션 경합 — 상대가 시딩했으니 다시 읽는다
      const again = await step('db-read', { uid }, () => loadContext(db, uid, {
        skipDetailType: false, snapshotEvery: SNAPSHOT_EVERY, bountyDayStart: null,
      }));
      if (!again.row) throw new ApiError(500, 'db-seed', { uid });
      row = again.row;
      instances = again.instances ?? [];
      records = again.records ?? [];
    } else {
      // 방금 쓴 값을 다시 읽지 않는다 — 시딩 결과가 곧 현재 상태다(개체·도감 포함).
      row = { data: stateRow(seed).data, version: 1,
              gold: seed.gold, fame: seed.fame, boat: seed.boat, rod: seed.rod };
      instances = seed.bag.map(i => instRow(uid, i, null) as InstanceRow);
      records = Object.entries(seed.dex).flatMap(([fishId, forms]) => Object.entries(forms).flatMap(([form, rec]) =>
        rec ? [{ fish_id: fishId, form, count: rec.count, max_size: rec.maxSize, first_caught: rec.first }] : []));
    }
  }

  // 제재 계정 — 0008 restricted 플래그. 자산·기록은 그대로 두고 활동만 막는다(삭제 아님).
  // 시딩 직후의 새 행은 default false라 여기서 걸리는 건 운영자가 명시적으로 표시한 계정뿐.
  if (row.restricted) throw new ApiError(403, 'restricted');

  // 매크로 페이싱 검사 — 직전 성공 액션과의 최소 간격(서버 시각 기준). updated_at은 성공
  // 커밋마다 이미 갱신되므로 읽기·쓰기 추가가 0이다. 쿠폰·지원코드 조회보다 **먼저** 검사해
  // 거절된 요청으로 코드 행이 소비되는 일을 막는다. 시딩 행(v1)과 첫 액션은 제외.
  const lastActionMs = Date.parse(String(row.updated_at ?? ''));
  if (Number.isFinite(lastActionMs) && Number(row.version) > 1) {
    const gapMs = PACING_SLOW.has(action.type) ? MIN_ACTION_GAP_MS : MIN_ACTION_GAP_FAST_MS;
    if (Date.now() - lastActionMs < gapMs) {
      throw new ApiError(429, 'too-fast');
    }
  }

  // 동적 쿠폰(coupons 테이블) — 쿠폰 액션일 때만 서버가 직접 조회 (active=false는 신규 사용 차단)
  let dynamicCoupon: { gold: number; desc: string } | null = null;
  if (action.type === 'redeemCoupon' && typeof action.code === 'string') {
    const code = action.code.trim();
    dynamicCoupon = await step('db-read', { uid, action: action.type }, () => findCoupon(db, code));
  }

  // 지원 코드(reliefs 테이블) — **선소비 후적용**. active=true 조건부 UPDATE가 성공한 요청만
  // 자산을 받는다(동시 수령 경합 원천 차단 — 코드당 1행이라 UPDATE 승자가 1개). 적용 직후
  // 실패할 규칙이 없으므로 코드가 탈 일은 사실상 없다.
  let relief: ActionDeps['relief'] = null;
  if (action.type === 'claimRelief' && typeof action.code === 'string') {
    const code = action.code.trim();
    if (code) {
      const g = await step('db-write', { uid, action: action.type }, () => consumeRelief(db, code, uid));
      if (g) relief = { gold: g.gold, fame: g.fame, rod: g.rod, boat: g.boat, dex: g.dex as GameState['dex'] };
    }
  }

  // 닉네임 변경 — 형태는 리듀서가 재검증한다. 여기서 할 일은 중복 검사 + 반영뿐.
  if (action.type === 'setNickname' && typeof action.nickname === 'string'
      && checkNickname(action.nickname).ok) {
    const wanted = action.nickname;
    if (await step('db-read', { uid, action: action.type }, () => nicknameTaken(db, uid, wanted))) {
      throw new ApiError(422, 'nickname-taken');
    }
    await step('db-write', { uid, action: 'setNickname' }, () => setNickname(db, uid, wanted, new Date().toISOString()));
  }

  // 현상금 — DB가 진실의 원천인 데이터에 대한 서버 담당분.
  // 라이선스 소유·일일 카운트·진행도·도전권은 saves가 아니라 전용 테이블에 있다.
  // 리듀서는 검증+감사 이벤트(+납품 골드)만 맡고, 행 기록·주입은 여기서 한다.
  let bounty: ActionDeps['bounty'] = null;
  let expired: ReturnType<typeof expiredQuests> = []; // 이번 읽기에서 만료로 판정한 의뢰 — 응답 뒤에 정리한다
  if (wantsBounty) {
    const rows = loaded.bounty ?? { clears: [], progress: [], tickets: [] };
    bounty = toBountyCtx(rows, dayStart);
    expired = expiredQuests(rows, dayStart);

    // 일일 의뢰 검증 — 오늘(게임 날짜) 그 사람에게 뜬 의뢰가 아니면 변조다.
    // 리듀서는 uid를 몰라 서버가 여기서 잠근다.
    if (action.type === 'acceptQuest') {
      const quest = bountyById(action.questId);
      const offered = quest && dailyQuestFor(quest.zone, quest.difficulty, uid, gameDayOf(requestISO));
      if (!offered || offered.id !== action.questId) {
        throw new ApiError(422, 'bad-request');
      }
    }

    // 납품은 선소비(reliefs 선례) — 진행 행을 먼저 지운다. 동시 납품 경합은
    // 지운 쪽만 성공하고, 나머지는 주입 complete가 비어 리듀서가 422로 거부한다.
    if (action.type === 'deliverBounty' && bounty.complete.includes(action.questId)) {
      const questId = action.questId;
      const consumed = await step('db-write', { uid, action: action.type }, () => consumeDelivery(db, uid, questId));
      if (!consumed) bounty = { ...bounty, complete: [] };
    }
  }

  let out: ApplyOutcome;
  // fast path의 조립 상태 — 네임드 교체 블록이 재사용한다 (아래 out 교체 참조)
  let catchBase: GameState | null = null;
  if (action.type === 'catch' && skipDetail) {
    out = await fastCatch(db, uid, row, action.spot, action.judgment);
    if (out.ok) catchBase = migrate({ ...(row.data as object), v: 8, gold: Number(row.gold),
      fame: Number(row.fame), boat: row.boat, rod: row.rod, bag: [], exhibit: [], dex: {} });
  } else {
    const state = assemble(row, instances, records);
    out = applyAction(state, action, {
      rng: Math.random, today: todayKST(),
      now: new Date().toISOString(), newUid: () => crypto.randomUUID(),
      dynamicCoupon,
      relief,
      bounty,
    });
  }
  if (!out.ok) throw new ApiError(422, out.error); // 규칙 거부 — 정상 응답이라 보고하지 않는다

  // 지명 수배 조우 (fast path) — 게이트 명중해도 통상 결과를 버리지 않는다.
  // 도전권 발급 이벤트만 덧붙이고 낚시는 그대로 진행한다 (챌린지절).
  if (action.type === 'catch' && catchBase && bounty) {
    const namedHit = rollNamedEncounter(bounty.active, action.spot, Math.random, action.forceEncounter === true);
    if (namedHit) {
      out.events.push({ type: 'ticket', payload: { questId: namedHit.id } });
      if (out.result.type === 'catch') out.result.ticket = namedHit.id;
    }
  }

  // 확정 — 낙관 락 갱신과, 그것이 성공했을 때만 쓰는 행(개체·도감·수배·편지)을 한 문장으로 쓴다.
  // 읽은 version이 그대로가 아니면 아무것도 쓰지 않고 409를 돌려준다. 클라이언트(HttpGameGateway)가
  // 최신 상태 위에 1회 재시도한다. 멀티탭 동시 수주도 이 락이 하나만 통과시킨다.
  const nowISO = new Date().toISOString();
  // 이벤트 시각 단일화 — letters와 events가 같은 created_at을 써야 복사 INSERT의 dedupe가 성립한다(Ruling 2026-10-07).
  const eventNow = nowISO;
  const guard = COMMIT_GUARD;
  const fragments: (SQL | null)[] = [...writeFragments(guard, uid, out.writes, nowISO)];
  if (action.type === 'acceptQuest' && typeof action.questId === 'string' && typeof action.port === 'string') {
    const quest = bountyById(action.questId);
    if (quest) fragments.push(...acceptFragments(guard, uid, quest, action.port, nowISO, dayStart));
  }
  // 클리어 기록 — 보상을 주는 납품·토벌과 같은 확정 문장에서 쓴다. 리듀서가 완료를 이미 검증했다.
  if (action.type === 'deliverBounty' && typeof action.questId === 'string') {
    const quest = bountyById(action.questId);
    if (quest) fragments.push(clearFragment(guard, uid, quest, nowISO));
  }
  // 도전권 발급 — catch의 ticket 이벤트를 행으로 확정한다.
  const ticketQuests = out.events.flatMap(e => {
    if (e.type !== 'ticket') return [];
    const questId = (e.payload as { questId?: unknown }).questId;
    return typeof questId === 'string' && bountyById(questId) ? [questId] : [];
  });
  fragments.push(ticketFragment(guard, uid, ticketQuests, nowISO));
  // 챌린지 결과 확정 — 리듀서가 티켓 유효·수주 활성·주장 정합성을 이미 검증했다.
  if (action.type === 'resolveChallenge' && typeof action.questId === 'string' && bountyById(action.questId)) {
    fragments.push(...challengeFragments(guard, uid, action.questId, action.success === true, nowISO));
  }
  // 개발 도구 테이블 명령 — 허용 판정은 위에서 끝났다. 리듀서가 검증한 명령만 여기 온다.
  if (action.type === 'debug' && isDebugTableCommand(action.command)) {
    fragments.push(debugFragment(guard, uid, debugTablePlan(action.command, Date.now())));
  }
  fragments.push(letterFragment(guard, uid, out.events, eventNow));

  const readVersion = Number(row.version);
  const nextVersion = readVersion + 1;
  // 유저 입장에서는 "행동이 저장되지 않음" — 가장 아픈 실패. 500이라 자동 보고된다
  const committed = await step('db-write', { uid, action: action.type },
    () => commitAction(db, versionUpdate(uid, out.state, readVersion, nowISO), fragments));
  if (!committed) throw new ApiError(409, 'version-conflict');

  // 후속 쓰기 — 이벤트 append, 주기 스냅샷, 캐치의 의뢰 진행, 만료 의뢰 정리. 유실 허용 묶음이라 응답 뒤에 실행하고
  // 실패해도 상태는 되돌리지 않는다. 다만 조용히 잃지 않도록 보고한다.
  // 의뢰 진행은 증분이라 자가 치유가 없다 — 유실분은 사용자가 다시 잡아야 메운다.
  // 만료 정리는 읽을 때 이미 판정이 끝나 있어 늦거나 유실돼도 판정은 같다. 다음 수배 액션이 다시 정리한다.
  const followUps: (SQL | null)[] = [eventsInsert(uid, out.events, eventNow)];
  if (nextVersion % SNAPSHOT_EVERY === 0) followUps.push(snapshotInsert(uid, out.state, nowISO));
  if (action.type === 'catch' && bounty) {
    followUps.push(advanceProgress(uid, catchProgressQuests(out.events, bounty.active), nowISO));
  }
  followUps.push(...expiredCleanup(uid, expired, dayStart));
  const actionType = action.type;
  waitUntil(runFollowUps(db, followUps).catch(e =>
    reportServerIssue('후속 쓰기 실패 — events/스냅샷/의뢰 진행 유실', e, { uid, action: actionType, version: nextVersion })));

  // 응답은 델타가 기본 — 풀가방 왕복이 egress 주범이라 초기 로드 이후에는 변경분만
  // 보낸다. import는 통째 교체라 풀 유지 (빈도 극저, 예외).
  // 클라(HttpGameGateway)는 델타를 캐시에 적용해 풀을 복원하므로 UI 계약은 불변이다.
  if (action.type === 'import') {
    res.status(200).json({ state: out.state, result: out.result, version: nextVersion });
    return;
  }
  const patch: StatePatch = {
    version: nextVersion, baseVersion: readVersion,
    scalars: pickScalars(out.state), writes: out.writes,
  };
  res.status(200).json({ patch, result: out.result });
}

/** 캐치가 진전시키는 일반 의뢰 — 수주 중(만료되지 않은) 의뢰만 본다. 네임드는 결투 성공(resolveChallenge)으로만 진전한다 */
export function catchProgressQuests(events: readonly GameEvent[], activeIds: readonly string[]): string[] {
  const caught = events.find(e => e.type === 'catch');
  const spot = (caught?.payload as { spot?: unknown } | undefined)?.spot;
  const fishId = (caught?.payload as { fishId?: unknown } | undefined)?.fishId;
  if (typeof spot !== 'string' || typeof fishId !== 'string') return [];
  return activeIds
    .map(id => bountyById(id))
    .filter(q => q && q.difficulty !== 'named' && matchBountyCatch(q, spot as SpotId, fishId))
    .map(q => q!.id);
}

/**
 * catch fast path — 풀가방 조회 없이 도감 1행 + 가방 수, 가방이 가득 차면 등급별 방생 후보 1마리씩.
 * 추첨(prepareCatchDraw·rollCatchFish)은 리듀서와 같은 헬퍼를 호출한다 — 규칙이 여기 새로 생기지 않는다.
 * 스냅샷 경계 버전은 풀 경로(아카이브용 풀 상태).
 */
async function fastCatch(db: Executor, uid: string, row: StateRow, spot: SpotId, judgmentIn: Parameters<typeof prepareCatchDraw>[2]): Promise<ApplyOutcome> {
  const base = migrate({ ...(row.data as object), v: 8, gold: Number(row.gold),
    fame: Number(row.fame), boat: row.boat, rod: row.rod, bag: [], exhibit: [], dex: {} });
  const gate = canFish(base, spot);
  if (!gate.ok) return { ok: false, error: gate.reason };
  const pz = powerZones(base, spot);
  const now = new Date().toISOString();
  const { judgment, bait, phaseOpts } = prepareCatchDraw(base, spot, judgmentIn, now, pz);
  const today = todayKST();
  const entry = SPOTS.find(s => s.id === spot)?.powerReq ?? 0;
  const fish = rollCatchFish(spot, judgment, rodPower(base), entry, pz.mult, Math.random, phaseOpts);
  const extras = rollCatchExtras(fish, Math.random, mutationWeightsOf(base, spot));
  // 조회 실패는 신규로 간주하지 않는다 — count 1로 upsert하면 진짜 도감을 덮어쓴다
  const { dex: d, bagCount } = await step('db-read', { uid, action: 'catch' }, () => catchLookup(db, uid, fish.id, extras.form));
  const prev: FormRecord | undefined = d
    ? { count: Number(d.count), maxSize: d.max_size, first: d.first_caught?.slice(0, 10) ?? null }
    : undefined;
  const isNew = (prev?.count ?? 0) === 0;
  const info = buildCatchInfo(fish, extras, isNew);
  const inst = makeInstance(fish, extras, { uid: crypto.randomUUID(), now, spot, judgment });
  const rec = nextDexRec(prev, inst.size, today);
  const over = bagCount + 1 - Math.max(capOfBoat(base.boat), bagCount);
  let added: { inst: FishInstance; slot: number | null }[] = [{ inst, slot: null }];
  let removed: string[] = [];
  let released: ReleasedFish[] = [];
  if (over > 0) {
    // 등급별 top-1 — [삭제어종, 일반, 희귀, 영웅, 전설] 순 첫 비어있지 않은 칸이 풀가방 정렬의 선두와 같다.
    // 등급 목록은 FISH에서 뽑으니 신어종 자동 반영, 스키마 변경 없이 끝난다. form 텍스트 정렬(normal < variant)이
    // 비교자와 일치함은 FormId 2종 전제 — exhaustiveness 검증이 깨지면 이 분기를 확인한다.
    // 조회 실패를 빈 칸으로 취급하면 엉뚱한 놈을 방생한다 — 조용히 넘기지 않는다
    const victims = await step('db-read', { uid, action: 'catch' }, () => evictionCandidates(db, uid,
      FISH.map(f => f.id), RARITY_ORDER.map(r => FISH.filter(f => f.rarity === r).map(f => f.id))));
    const tops: (FishInstance | null)[] = victims.map(t => t ? {
      uid: t.uid, fishId: t.fish_id, form: t.form as FishInstance['form'],
      size: t.size, caughtAt: null, spot: null, judgment: null, locked: false,
    } : null);
    const pick = pickEvict(tops, inst);
    if (pick.evictUid) {
      removed = [pick.evictUid];
      const gone = tops.find(t => t?.uid === pick.evictUid)!;
      const f = instanceFish(gone);
      released = [{ uid: gone.uid, name: f ? formName(f, gone.form) : gone.fishId }];
    } else if (pick.evictNew) {
      added = []; // 새 놈이 가장 안 특별 — 그 자리에서 놓아준다
      released = [{ uid: inst.uid, name: formName(fish, inst.form) }];
    }
    // 둘 다 아니면 전부 잠김 — 상한 초과 유지 (리듀서와 동일)
  }
  const overflow = removed.length > 0 ? removed : (added.length === 0 ? [inst.uid] : []);
  const events: GameEvent[] = [{ type: 'catch', payload: {
    uid: inst.uid, fishId: fish.id, judgment, spot,
    size: info.size, form: info.form, isNew: info.isNew,
    ...(bait ? { bait: bait.id } : {}),
  } }];
  if (overflow.length > 0) {
    events.push({ type: 'autoRelease', payload: { uids: overflow, reason: 'bag-full' } });
  }
  const scalars = takeItem(base, bait?.id ?? '');
  return {
    ok: true,
    state: { ...scalars, fame: scalars.fame + RARITY[fish.rarity].fame },
    result: { type: 'catch', fishId: fish.id, uid: inst.uid, info, released },
    events,
    writes: {
      instancesAdded: added, instancesRemoved: removed,
      instancesMoved: [], instancesLocked: [],
      records: [{ fishId: fish.id, form: inst.form, rec }],
    },
  };
}
