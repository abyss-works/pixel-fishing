// HTTP 백엔드 — /api/action 경유 (스테이징·운영의 유일한 상태 변경 경로, 서버 권위 v0.5.0)
// 읽기(load)는 saves_current 본인 행(RLS select) → 없으면 구 saves 최신 행 폴백(이관 전 유저).
import { supabase } from './auth';
import { migrate } from '../game/logic';
import { APP_VERSION } from '../version';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { Backend, DispatchResult } from './types';
import { AppError } from '../errors';
import { REJECT_TEXT } from '../game/rules';
import type { RejectReason } from '../game/rules';

export class HttpBackend implements Backend {
  async load(): Promise<GameState | null> {
    if (!supabase) return null;
    const { data: cur } = await supabase
      .from('saves_current').select('data').maybeSingle(); // RLS: 본인 행만
    if (cur) return migrate(cur.data);
    // 이관 폴백 — 서버 권위 전환 전 유저는 saves(스냅샷 아카이브)의 최신 행이 최신 상태다
    const { data: old } = await supabase
      .from('saves').select('data')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return old ? migrate(old.data) : null;
  }

  // 실패는 전부 AppError로 던진다 — 여기서 UX를 정하지 않는다 (src/errors.ts 정책 소관)
  async dispatch(action: GameAction, retried = false): Promise<DispatchResult> {
    const session = await this.session();
    const res = await this.post(action, session);

    if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      // 함수 미존재/플랫폼 장애 — JSON이 아니면 우리 응답이 아니다
      throw new AppError('server', 'non-json response', { status: res.status });
    }
    const body = await res.json().catch(() => null) as
      { state?: unknown; result?: unknown; error?: string } | null;

    if (res.ok && body?.state) {
      return { status: 'ok', state: migrate(body.state), result: body.result as never };
    }
    // 409 = 낙관 락 충돌(다른 탭과 경합) — 서버가 최신 상태 위에 재적용하도록 1회 재시도
    if (res.status === 409 && !retried) return this.dispatch(action, true);
    if (res.status === 422) return { status: 'rejected', error: HttpBackend.reason(body?.error) };
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

  private async session(): Promise<string> {
    if (!supabase) throw new AppError('network', 'supabase not configured');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new AppError('unauthorized', 'no session');
    return session.access_token;
  }

  private async post(action: GameAction, token: string): Promise<Response> {
    try {
      return await fetch('/api/action', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-client-version': APP_VERSION, // 낡은 탭 차단 — 서버가 자기 버전과 대조 (426)
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
