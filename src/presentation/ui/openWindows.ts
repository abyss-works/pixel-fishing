import { useEffect, useRef } from 'react';

// 떠 있는 창의 등록부 - 닫을 수 있는 창(Modal)이 열려 있는 동안 등록하고, 탭 줄을 누를 때 모두 닫는다.
// 닫을 수 없는 창(진행을 막는 안내, 결투의 진행 단계)은 등록하지 않으므로 그대로 남는다.
// 탭 누름은 막지 않으므로 탭은 늘 열린다. 그래서 결과 전송 없이 창이 사라지는 경로가 없다.
const open = new Set<() => void>();

/** 닫을 수 있는 창이 떠 있는 동안 등록한다. close가 없으면(닫을 수 없는 창) 등록하지 않는다 */
export function useOpenWindow(close: (() => void) | undefined) {
  const ref = useRef(close);
  useEffect(() => { ref.current = close; });
  const closable = close !== undefined;
  useEffect(() => {
    if (!closable) return;
    const entry = () => ref.current?.();
    open.add(entry);
    return () => { open.delete(entry); };
  }, [closable]);
}

/** 닫을 수 있는 창이 하나라도 떠 있는가 */
export const hasOpenWindows = (): boolean => open.size > 0;

/** 탭 줄을 눌렀을 때 호출한다. 등록된 닫을 수 있는 창을 모두 닫는다 */
export function closeOpenWindows(): void {
  for (const close of [...open]) close();
}

/** 테스트 격리용 */
export function resetOpenWindows() {
  open.clear();
}
