import { useEffect, useSyncExternalStore } from 'react';
import type { TutorialId } from '../../../game/content/tutorials';
import type { GameAction } from '../../../game/rules/actions';
import { pendingTutorial } from '../model/tutorial';

// 튜토리얼 트리거와 이번 세션에 닫은 튜토리얼 — 화면 여러 곳(게임 화면, 수배판)이 트리거를 켜고,
// 게임 화면의 튜토리얼 창 하나가 이 상태를 읽어 띄운다.
// 닫은 튜토리얼은 서버 응답을 기다리지 않고 바로 숨긴다(본 기록은 seeTutorial 액션이 상태에 남긴다).
interface Store {
  active: readonly TutorialId[];
  closed: readonly TutorialId[];
}

let store: Store = { active: [], closed: [] };
const listeners = new Set<() => void>();

function update(next: Store) {
  store = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getStore = () => store;

/** 화면이 트리거를 켜고 끈다 — on이 참인 동안 켜져 있고, 화면이 사라지면 꺼진다 */
export function useTutorialTrigger(id: TutorialId, on: boolean): void {
  useEffect(() => {
    if (!on) return;
    update({ ...store, active: [...store.active, id] });
    return () => {
      const i = store.active.indexOf(id);
      if (i >= 0) update({ ...store, active: [...store.active.slice(0, i), ...store.active.slice(i + 1)] });
    };
  }, [id, on]);
}

/**
 * 지금 띄울 튜토리얼과 닫기.
 * @param seen 게임 상태의 본 튜토리얼
 * @param ready 세이브가 준비됐는지 — 준비 전의 빈 상태로 판정하지 않는다
 * @param suspended 다른 안내 창(업데이트 소식)이 떠 있거나 뜰 차례면 참 — 끝난 뒤 차례로 띄운다
 */
export function useTutorial({ seen, ready, suspended, dispatch }: {
  seen: readonly string[];
  ready: boolean;
  suspended: boolean;
  dispatch: (action: GameAction) => unknown;
}) {
  const s = useSyncExternalStore(subscribe, getStore, getStore);
  const current = ready && !suspended ? pendingTutorial(s.active, [...seen, ...s.closed]) : null;
  const close = () => {
    if (!current) return;
    update({ ...store, closed: [...store.closed, current] });
    // 본 기록이 실패해도 다음 접속에 한 번 더 뜰 뿐이라 조용히 넘긴다
    void Promise.resolve(dispatch({ type: 'seeTutorial', id: current })).catch(() => {});
  };
  return { current, close };
}

/** 테스트 격리용 — 트리거와 닫은 기록을 비운다 */
export function resetTutorialSession(): void {
  update({ active: [], closed: [] });
}
