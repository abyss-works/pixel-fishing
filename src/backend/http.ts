// HTTP 백엔드 — /api/action 경유 (스테이징·운영의 유일한 상태 변경 경로, 서버 권위 v0.5.0)
// 읽기(load)는 saves_current 본인 행(RLS select) → 없으면 구 saves 최신 행 폴백(이관 전 유저).
import { supabase } from './auth';
import { migrate } from '../game/logic';
import { APP_VERSION } from '../version';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import type { Backend, DispatchResult } from './types';

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

  async dispatch(action: GameAction, retried = false): Promise<DispatchResult> {
    if (!supabase) return { status: 'error' };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { status: 'error' };

    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
          'x-client-version': APP_VERSION, // 낡은 탭 차단 — 서버가 자기 버전과 대조 (426)
        },
        body: JSON.stringify(action),
      });
      if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
        return { status: 'error' }; // 함수 미존재/플랫폼 장애 — JSON이 아니면 우리 응답이 아니다
      }
      const body = await res.json().catch(() => null) as
        { state?: unknown; result?: unknown; error?: string } | null;
      if (res.ok && body?.state) {
        return { status: 'ok', state: migrate(body.state), result: body.result as never };
      }
      // 409 = 낙관 락 충돌(다른 탭의 액션과 경합) — 서버가 최신 상태 위에 재적용하도록 1회 재시도
      if (res.status === 409 && !retried) return this.dispatch(action, true);
      if (res.status === 422) return { status: 'rejected', error: body?.error ?? 'rejected' };
      if (res.status === 426) return { status: 'outdated' }; // 배포 후 새로고침 안 한 낡은 탭
      return { status: 'error' };
    } catch {
      return { status: 'error' }; // 네트워크 순단 — 진행 불가, 호출자가 rescue 안내
    }
  }
}
