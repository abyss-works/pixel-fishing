import { useEffect, useRef } from 'react';

// 전역 키 입력의 단일 관문 — **레이어 스택**.
//
// 예전 구조는 소비자마다 `document.addEventListener('keydown')`를 직접 걸고 각자 판단했다.
// 두 가지가 구조적으로 안 된다:
//   ① 모달이 아래를 막을 수 없다. 로그인 모달이 떠 있어도 필드는 계속 키를 먹어 캐릭터가
//      뒤에서 움직였다(실제 사고). 임시 처방이 `isTyping`이었지만 그건 **텍스트 포커스**만
//      막는다 — 모달 버튼에 포커스가 있으면 그대로 샌다.
//   ② 소비자가 늘 때마다 가드가 복제된다. 판단이 갈리면 화면마다 동작이 달라진다.
//
// 여기서는 소비자가 **스코프**를 등록하고, 배분은 이 모듈 하나가 한다:
//   - 나중에 등록된 스코프(= 화면 위쪽)가 먼저 본다.
//   - 핸들러가 `true`를 반환하면 소비했다는 뜻이라 아래로 안 내려간다.
//   - `exclusive` 스코프(모달)는 **자기보다 아래를 통째로 차단**한다. 핸들러가 없어도 된다 —
//     "아무것도 안 하지만 아래도 못 하게 한다"가 모달에 필요한 기본값이다.

type Handler = (e: KeyboardEvent) => boolean | void;
interface Scope { handler: Handler; exclusive: boolean }

const stack: Scope[] = [];
let attached = false;

/** 텍스트 입력에 포커스가 있으면 어떤 스코프도 키를 못 가져간다 — 폼 타이핑은 언제나 우선.
 *  (전역 리스너의 preventDefault가 인풋의 문자 입력까지 죽이던 잠복 버그, v0.4.1 QA) */
function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
    || el.tagName === 'SELECT' || el.isContentEditable);
}

/** 브라우저·OS 단축키(Ctrl+1 탭 전환 등)를 가로채지 않는다 — 필요한 소비자가 직접 부른다 */
export const hasModifier = (e: KeyboardEvent): boolean =>
  e.ctrlKey || e.metaKey || e.altKey;

function dispatch(e: KeyboardEvent) {
  if (isTyping(e)) return;
  // 가장 위의 exclusive 스코프까지만 내려간다 (없으면 바닥까지)
  let floor = 0;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].exclusive) { floor = i; break; }
  }
  for (let i = stack.length - 1; i >= floor; i--) {
    if (stack[i].handler(e) === true) return;
  }
}

/** 키 스코프 등록. 마운트 순서가 곧 층위 — 나중에 마운트된 쪽이 위다.
 *  핸들러는 ref로 읽으므로 리렌더마다 재등록하지 않는다(키 입력과 리렌더가 겹칠 때 새는 것 방지). */
export function useKeyScope(handler: Handler, opts: { exclusive?: boolean } = {}) {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });

  const exclusive = opts.exclusive === true;
  useEffect(() => {
    const scope: Scope = { handler: e => ref.current(e), exclusive };
    stack.push(scope);
    if (!attached) { document.addEventListener('keydown', dispatch); attached = true; }
    return () => {
      const i = stack.indexOf(scope);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [exclusive]);
}

/** 모달용 — 자기는 아무 키도 안 쓰지만 아래 레이어를 막는다 */
export const useKeyBlocker = () => useKeyScope(() => {}, { exclusive: true });

/** 테스트 격리용 — 스택은 모듈 전역이라 케이스 사이에 비워야 한다 */
export function resetKeyScopes() {
  stack.length = 0;
}
