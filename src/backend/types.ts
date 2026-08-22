// 백엔드 경계 (계층: api) — 게임 상태의 유일한 변경 경로는 dispatch다 (서버 권위 v0.5.0).
// 구현 2개: HttpBackend(/api/action — 스테이징·운영의 유일한 경로) · LocalBackend(supabase
// 미설정 dev — 같은 리듀서를 로컬 실행). 표시용 순수 계산은 클라에 남고, 상태 전이는 여기로만.
import type { GameAction, ActionResult } from '../game/actions';
import type { GameState } from '../game/logic';

export type DispatchResult =
  | { status: 'ok'; state: GameState; result: ActionResult }
  | { status: 'rejected'; error: string } // 규칙 거부(골드 부족·잠긴 수역 등) — 재시도 무의미
  | { status: 'outdated' }                // 클라 버전 구식(426) — 새로고침 안내 모달 대상
  | { status: 'error' };                  // 네트워크/서버 장애 — 진행 불가, rescue 안내 대상

/** LocalBackend는 동기, HttpBackend는 비동기 — 동기 경로를 Promise로 감싸지 않는 이유는
    오프라인(dev·테스트)에서 상태 반영이 같은 틱에 끝나야 하기 때문(테스트 타이밍 계약 유지) */
export type MaybePromise<T> = T | Promise<T>;

export interface Backend {
  /** 초기 로드 — 저장된 상태(마이그레이션 완료본) 또는 null. GET은 로드 전용 원칙. */
  load(): MaybePromise<GameState | null>;
  dispatch(action: GameAction): MaybePromise<DispatchResult>;
}

/** 동기/비동기 공용 후처리 헬퍼 — 값이면 즉시, Promise면 then */
export function when<T, R>(v: MaybePromise<T>, fn: (t: T) => R): MaybePromise<R> {
  return v instanceof Promise ? v.then(fn) : fn(v);
}
