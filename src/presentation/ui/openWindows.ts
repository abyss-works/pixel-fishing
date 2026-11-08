import { useEffect, useRef } from 'react';

// 떠 있는 창의 등록부 - 창(Modal)이 열려 있는 동안 등록하고, 탭 줄을 누를 때 닫을 수 있는 창을 모두 닫는다.
// 닫을 수 없는 창(closable=false: 진행을 막는 안내, 결투의 진행 단계)은 닫지 않고 그대로 둔다.
// 탭 누름은 막지 않으므로 탭은 늘 열린다. 그래서 결과 전송 없이 창이 사라지는 경로가 없다.
interface Entry { close: (() => void) | null }

const open = new Set<Entry>();

/** 창이 떠 있는 동안 등록한다. close가 없으면 닫을 수 없는 창이다 */
export function useOpenWindow(close: (() => void) | undefined) {
  const ref = useRef(close);
  useEffect(() => { ref.current = close; });
  const closable = close !== undefined;
  useEffect(() => {
    const entry: Entry = { close: closable ? () => ref.current?.() : null };
    open.add(entry);
    return () => { open.delete(entry); };
  }, [closable]);
}

/** 탭 줄을 눌렀을 때 호출한다. 닫을 수 있는 창을 모두 닫고, 닫을 수 없는 창은 그대로 둔다 */
export function closeOpenWindows(): void {
  for (const e of [...open]) e.close?.();
}

/** 테스트 격리용 */
export function resetOpenWindows() {
  open.clear();
}
