// 로컬 백엔드 — supabase 미설정(오프라인 dev·테스트) 전용. 서버와 같은 리듀서(applyAction)를
// 로컬에서 동기 실행한다 — 순수 리듀서 공유 덕에 구현이 얇다. 프로덕션에선 절대 안 탄다
// (HttpBackend 생성 조건이 supabase 존재). 동적 쿠폰은 오프라인이라 항상 없음(정적 쿠폰만).
import { applyAction } from '../game/actions';
import type { GameAction } from '../game/actions';
import { localDate } from '../game/logic';
import type { GameState } from '../game/logic';
import type { Backend, DispatchResult } from './types';

export class LocalBackend implements Backend {
  private current: GameState;

  constructor(initial: GameState) {
    this.current = initial;
  }

  load(): GameState {
    return this.current;
  }

  dispatch(action: GameAction): DispatchResult {
    const out = applyAction(this.current, action, { rng: Math.random, today: localDate() });
    if (!out.ok) return { status: 'rejected', error: out.error };
    this.current = out.state;
    return { status: 'ok', state: out.state, result: out.result };
  }
}
