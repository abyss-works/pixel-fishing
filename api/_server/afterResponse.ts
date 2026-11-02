// 응답을 보낸 뒤 이어 실행하는 작업. 상시 실행 서버라 응답을 막지 않고 진행시키며,
// 종료 신호를 받으면 남은 작업이 끝날 때까지 기다린다.
const pending = new Set<Promise<unknown>>();

/** 작업은 스스로 오류를 처리한 상태로 넘긴다. 여기서는 완료 여부만 추적한다. */
export function afterResponse(work: Promise<unknown>): void {
  pending.add(work);
  const done = () => { pending.delete(work); };
  work.then(done, done);
}

/** 진행 중인 응답 뒤 작업이 모두 끝날 때까지 기다린다. */
export async function settleAfterResponse(): Promise<void> {
  await Promise.allSettled([...pending]);
}
