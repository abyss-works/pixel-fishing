// 로컬 백엔드 — supabase 미설정(오프라인 dev·테스트) 전용. 서버와 같은 리듀서(applyAction)를
// 로컬에서 동기 실행한다 — 순수 리듀서 공유 덕에 구현이 얇다. 프로덕션에선 절대 안 탄다
// (HttpBackend 생성 조건이 supabase 존재). 동적 쿠폰은 오프라인이라 항상 없음(정적 쿠폰만).
import { applyAction } from '../game/actions';
import type { GameAction } from '../game/actions';
import { localDate } from '../game/logic';
import type { GameState } from '../game/logic';
import { getTimeOverride } from '../admin/timeOverride';
import { pickGuestName } from '../game/nickname';
import type { Backend, DispatchResult } from './types';

const LS_KEY = 'pixel-fishing-save';

function persistLocal(state: GameState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* quota 등 저장 실패는 무시 — 메모리 상태는 유지된다 */
  }
}

export class LocalBackend implements Backend {
  private current: GameState;
  private nickname: string | null = null;

  constructor(initial: GameState) {
    this.current = initial;
  }

  load(): GameState {
    return this.current;
  }

  getNickname(): string | null {
    if (!this.nickname) this.nickname = pickGuestName(Math.random);
    return this.nickname;
  }

  dispatch(action: GameAction): DispatchResult {
    const out = applyAction(this.current, action, {
      rng: Math.random, today: localDate(),
      // 시간대 고정(admin/timeOverride — 관리자 콘솔)이 있으면 그 시각으로 캐치 판정.
      // 없으면 실제 벽시계. 운영(HttpBackend)은 이 모듈을 안 타므로 서버 판정이 유지된다.
      now: getTimeOverride() ?? new Date().toISOString(), newUid: () => crypto.randomUUID(),
    });
    if (!out.ok) return { status: 'rejected', error: out.error };
    this.current = out.state;
    persistLocal(out.state);
    if (action.type === 'setNickname' && typeof action.nickname === 'string') {
      this.nickname = action.nickname;
    }
    return { status: 'ok', state: out.state, result: out.result };
  }
}
