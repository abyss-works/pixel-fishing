// HTTP 게임 게이트웨이 — /api/action 경유 (스테이징·운영의 유일한 상태 변경 경로, 서버 권위 v0.5.0)
// 읽기(load)는 서버 읽기 함수가 주는 본인 행 → saves_current가 없으면 구 saves 최신 본문 폴백(이관 전 유저).
import { isCloud } from './auth';
import { readMe } from './me';
import { migrate } from '../../game/rules/logic';
import type { GameState } from '../../game/rules/logic';
import type { GameAction, StatePatch } from '../../game/rules/actions';
import { applyPatch } from '../../game/rules/actions';
import type { GameGateway, DispatchResult } from '../api/types';
import { AppError } from '../../core/errors';
import { BUILD_ID } from '../../buildId';
import { APP_VERSION } from '../../version';
import { REJECT_TEXT } from '../../game/rules/rules';
import type { RejectReason } from '../../game/rules/rules';

type Row = Record<string, never> | Record<string, unknown>;

// 창 식별자 — 창(탭)마다 새로 만든다. 서버는 마지막으로 접속(boot)한 창의 액션만 받는다
const CLIENT_ID = crypto.randomUUID();

/** 세 소스에서 GameState를 조립한다. 서버 조립과 같은 규칙을 적용한다. */
function assemble(cur: Row, instances: Row[], records: Row[]): GameState {
  const bag: unknown[] = [];
  const exhibit: unknown[] = [];
  for (const r of instances as Record<string, unknown>[]) {
    const inst = {
      uid: r.uid, fishId: r.fish_id, form: r.form, size: r.size,
      caughtAt: r.caught_at, spot: r.spot, judgment: r.judgment, locked: r.locked === true,
    };
    if (r.slot === null || r.slot === undefined) bag.push(inst);
    else exhibit[r.slot as number] = inst;
  }
  const dex: Record<string, Record<string, unknown>> = {};
  for (const r of records as Record<string, unknown>[]) {
    (dex[r.fish_id as string] ??= {})[r.form as string] = {
      count: Number(r.count), maxSize: r.max_size,
      first: typeof r.first_caught === 'string' ? r.first_caught.slice(0, 10) : null,
    };
  }
  const c = cur as Record<string, unknown>;
  return migrate({ ...(c.data as object), v: 8, gold: Number(c.gold), fame: Number(c.fame),
    boat: c.boat, rod: c.rod, bag, exhibit, dex });
}

export class HttpGameGateway implements GameGateway {
  // 델타 캐시 — 서버는 초기 로드 이후 변경분(patch)만 보내므로, 직전 풀 상태를 들고
  // 있어야 복원할 수 있다. 생성자·load()에서 시드되고, dispatch 성공마다 갱신된다.
  // 캐시는 표시용 복사본일 뿐 진실이 아니다: 버전 어긋남·적용 실패가 있으면 버리고
  // load() 풀재동기로 자가치유한다. 서버는 클라 상태를 입력으로 받지 않으므로
  // 캐시 오염(devtools)은 다음 액션에 정상화된다.
  private lastState: GameState | null;
  /** lastState의 saves_current 버전. 델타의 baseVersion과 다르면 역순 도착이므로 버린다.
   *  null = 모름 (레거시 이관 등) — 다음 델타는 무조건 풀재동기한다. */
  private lastVersion: number | null;
  constructor(initial: GameState | null = null) {
    this.lastState = initial;
    this.lastVersion = null;
  }
  // 저장소가 셋으로 갈려 있다(0006): saves_current(스칼라+blob) · fish_instances · records.
  // 서버가 세 표의 본인 행을 한 번에 돌려주고, 여기서 GameState로 조립한다.
  async load(): Promise<GameState | null> {
    if (!isCloud) return null;
    const me = await readMe<{ cur: Row | null; instances: Row[]; records: Row[]; legacy: unknown }>('state');
    if (me.cur) {
      const s = assemble(me.cur, me.instances, me.records);
      this.lastState = s;
      const v = Number((me.cur as { version?: unknown }).version);
      this.lastVersion = Number.isFinite(v) ? v : null;
      return s;
    }

    // 이관 폴백 — 아직 첫 액션을 하지 않은 유저는 구 saves(blob)의 최신 행이 유일한 정본이다
    const s = me.legacy ? migrate(me.legacy) : null;
    this.lastState = s;
    this.lastVersion = null; // 버전 모름 — 다음 델타는 풀재동기로 받는다
    return s;
  }

  // 실패는 전부 AppError로 던진다 — 여기서 UX를 정하지 않는다 (에러 처리 정책 소관)
  // 표시용 닉네임 읽기 — 표시 전용이라 실패는 이름 없음(null)으로 둔다.
  async getNickname(): Promise<string | null> {
    if (!isCloud) return null;
    const me = await readMe<{ nickname: unknown }>('profile').catch(() => null);
    return typeof me?.nickname === 'string' ? me.nickname : null;
  }

  async dispatch(action: GameAction, retried = false): Promise<DispatchResult> {
    if (!isCloud) throw new AppError('network', 'cloud not configured');
    const res = await this.post(action);

    if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      // 함수 미존재/플랫폼 장애 — JSON이 아니면 우리 응답이 아니다
      throw new AppError('server', 'non-json response', { status: res.status });
    }
    const body = await res.json().catch(() => null) as
      { state?: unknown; patch?: StatePatch; result?: unknown; error?: string; version?: unknown } | null;

    // 델타 경로 (기본) — baseVersion이 캐시와 정확히 이어질 때만 적용한다.
    // 어긋나면(역순 도착·계정 교체·낡은 캐시) 버리고 풀재동기 — 골드·가방이 과거값에
    // 고착되는 일을 원천 차단. 공개 계약(DispatchResult)은 불변이라 호출자는 풀을 받는다.
    if (res.ok && body?.patch && this.lastState && this.lastVersion !== null
        && body.patch.baseVersion === this.lastVersion) {
      try {
        const next = migrate(applyPatch(this.lastState, body.patch));
        this.lastState = next;
        this.lastVersion = body.patch.version;
        return { status: 'ok', state: next, result: body.result as never };
      } catch {
        // 적용 실패 — 캐시를 버리고 풀재동기로 자가치유 (아래 폴백)
        this.lastState = null;
        this.lastVersion = null;
      }
    }
    if (res.ok && (body?.state || body?.patch)) {
      // 풀 응답(import 등) — 그대로 채택. 캐시 없이 델타만 온 경우도 여기서 풀재동기한다
      // (서버는 액션을 이미 적용했으므로 load()는 적용 후 상태다 + 서버 result를 함께 쓴다).
      const s = body?.state ? migrate(body.state) : await this.load();
      if (s) {
        this.lastState = s;
        const v = Number(body?.version);
        if (Number.isFinite(v)) this.lastVersion = v;
        return { status: 'ok', state: s, result: body?.result as never };
      }
    }
    // 409 = 낙관 락 충돌(다른 탭과 경합) — 풀재동기로 캐시를 최신화한 뒤 1회 재시도.
    // 재시도의 델타는 최신 캐시 위에 얹히므로 순서가 보장된다.
    if (res.status === 409 && !retried) {
      await this.load().catch(() => null);
      return this.dispatch(action, true);
    }
    if (res.status === 422) return { status: 'rejected', error: HttpGameGateway.reason(body?.error) };
    // 403 = 게스트 거부(코드로 구분) 또는 제재 계정(0008 restricted)이나 권한 없는 요청(import 게이트) — 정책 표가 문구를 정한다
    if (res.status === 403) {
      if (body?.error === 'guest-village-only' || body?.error === 'account-only') {
        throw new AppError(body.error, `guest rejected (${body.error})`, { action: action.type });
      }
      throw new AppError('restricted', `forbidden (${body?.error ?? 'unknown'})`, { action: action.type });
    }
    // 429 = 매크로 페이싱 게이트 — 액션은 적용되지 않았다. 정책 표가 문구를 정한다
    if (res.status === 429) {
      throw new AppError('rate-limited', 'action pacing rejected', { action: action.type });
    }
    // 423 = 다른 창이 활성 창이 됐다 — 액션은 적용되지 않았다. 정책 표가 이 창을 막는다
    if (res.status === 423) throw new AppError('replaced', 'another window took over the session', { action: action.type });
    if (res.status === 426) throw new AppError('outdated', 'client version mismatch',
      { server: (body as { server?: string } | null)?.server });
    if (res.status === 401) throw new AppError('unauthorized', 'session rejected');
    throw new AppError('server', `action failed (${res.status})`,
      { status: res.status, error: body?.error, action: action.type });
  }

  /** 서버가 준 사유 문자열을 신뢰하지 않는다 — 아는 코드만 통과, 나머지는 일반 거부로 */
  private static reason(v: unknown): RejectReason {
    return typeof v === 'string' && v in REJECT_TEXT ? v as RejectReason : 'bad-request';
  }

  private async post(action: GameAction): Promise<Response> {
    try {
      return await fetch('/api/action', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // 낡은 탭 차단(426) — 운영 서버는 릴리즈 버전을, 그 밖의 서버는 배포 식별자를 대조한다.
          // 버전은 릴리즈 때만 올라가서 dev 배포 사이를 못 가르므로 둘 다 보낸다
          'x-build-id': BUILD_ID,
          'x-client-version': APP_VERSION,
          'x-client-id': CLIENT_ID,
        },
        body: JSON.stringify(action),
        // 무한 대기 방지 — catch 페이즈가 결과 도착까지 홀드되므로(Field), 상한 없으면 영구 정지
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      throw new AppError('network', 'action request failed', { action: action.type }, { cause });
    }
  }

  // 콜드 스타트 흡수 — 캐스팅 순간의 빈 핑(GET → 204 즉답)이 람다를 깨워, 몇 초 뒤의
  // 실제 챔질 POST가 웜 상태를 탄다. 추첨/상태와 무관해 보안 영향 없음.
  warmup(): void {
    fetch('/api/action', { method: 'GET' }).catch(() => { /* 워밍 실패는 무해 */ });
  }
}
