import { useEffect, useRef } from 'react';

// 떠 있는 창의 등록부 - 창(Modal)이 열려 있는 동안 등록하고, 탭 줄을 누를 때 닫을 수 있는 창을 모두 닫는다.
// 닫을 수 없는 창(closable=false: 진행을 막는 안내, 결투의 진행 단계)이 하나라도 있으면 아무것도 닫지 않고 탭 누름을 막는다.
// 그래서 결과 전송 없이 창이 사라지는 경로가 없다.
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

/** 탭 줄을 눌렀을 때 호출한다. 닫을 수 없는 창이 있으면 false(탭 누름을 막는다), 아니면 닫을 수 있는 창을 모두 닫고 true */
export function closeOpenWindows(): boolean {
  const entries = [...open];
  if (entries.some(e => e.close === null)) return false;
  for (const e of entries) e.close?.();
  return true;
}

/** 테스트 격리용 */
export function resetOpenWindows() {
  open.clear();
}
