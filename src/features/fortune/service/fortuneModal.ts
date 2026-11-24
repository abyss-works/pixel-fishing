// 오늘의 운세 접속 모달의 세션 상태 — 부팅이 그날의 운세를 새로 고정했을 때 한 번 뜬다.
// "첫 접속" 판정은 useGame의 dispatch 후처리가 한다(boot 응답 상태의 운세 날짜가 이전 상태와 달라진 경우뿐).
// 같은 날짜의 재접속과 판정(catch, sell)의 운세 갱신은 큐에 넣지 않는다.
import { useSyncExternalStore } from 'react';
import type { DailyFortune } from '../../../game/rules/fortune';

interface Store {
  /** 띄울 운세 — 닫기 전까지 남는다. 앞 차례 안내 창(업데이트 소식, 미끼 환불)이 끝나면 뜬다 */
  pending: DailyFortune | null;
  /** 이번 세션에서 이미 노출(또는 닫기 완료)한 게임 날짜 — 같은 날 중복 노출을 막는다 */
  shownDay: string | null;
}

const INITIAL: Store = { pending: null, shownDay: null };
let store: Store = INITIAL;
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

/** 그날의 운세가 새로 고정됐다 — useGame의 boot 후처리가 부른다. 같은 날 이미 노출했으면 무시한다 */
export function queueFortuneModal(fortune: DailyFortune): void {
  if (store.shownDay === fortune.day) return;
  update({ pending: fortune, shownDay: fortune.day });
}

/** 모달을 닫는다 — 대기 중인 운세를 비우고 해당 날짜의 노출 이력을 남긴다 */
export function closeFortuneModal(): void {
  update({ pending: null, shownDay: store.pending?.day ?? store.shownDay });
}

/** 현재 상태에서 노출할 운세와 대기 여부를 계산한다 */
export function selectFortuneModal(
  state: Pick<Store, 'pending'>,
  { ready, suspended }: { ready: boolean; suspended: boolean },
): { fortune: DailyFortune | null; pending: boolean } {
  const fortune = state.pending !== null && ready && !suspended ? state.pending : null;
  return { fortune, pending: state.pending !== null };
}

/** 스토어에서 직접 현재 노출 상태를 읽는다 */
export function readFortuneModal(opts: { ready: boolean; suspended: boolean }): { fortune: DailyFortune | null; pending: boolean } {
  return selectFortuneModal(store, opts);
}

/**
 * 띄울 운세와 닫기.
 * @param ready 세이브가 준비됐는지 — 준비 전에는 띄우지 않는다
 * @param suspended 먼저 뜰 다른 안내 창이 남아 있으면 참 — 끝난 뒤에 띄운다
 * @returns pending은 큐에 운세가 남아 있는지다. 뒤에 뜰 안내 창이 이 창 뒤로 차례를 미루는 데 쓴다
 */
export function useFortuneModal({ ready, suspended }: { ready: boolean; suspended: boolean }) {
  const s = useSyncExternalStore(subscribe, getStore, getStore);
  const { fortune, pending } = selectFortuneModal(s, { ready, suspended });
  return { fortune, pending, close: closeFortuneModal };
}

/** 테스트 격리 및 계정 전환용 — 세션을 처음으로 되돌린다 */
export function resetFortuneModalSession(): void {
  update(INITIAL);
}
