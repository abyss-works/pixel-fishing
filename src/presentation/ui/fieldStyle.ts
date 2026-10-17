// 입력 상자 공통 스타일 — TextInput·TextArea·Select·NumberStepper가 같은 테두리·배경·포커스를 쓴다.
// 표시 규칙을 한곳에서 바꾸려고 둔다. 화면에서는 쓰지 않는다(입력 컴포넌트를 쓴다).
import { cx } from './cx';

/** 입력 상자의 바탕 — 배경·테두리·모서리 */
export const FIELD_BOX = 'bg-bg border border-line rounded-sm';

/** 글자를 받는 입력 요소 — 바탕 + 글자색 + 포커스 테두리. compact = 표 셀용(픽셀 액센트, 작은 글자) */
export function fieldClass(compact?: boolean): string {
  return cx(FIELD_BOX, 'text-text outline-none focus:border-accent',
            compact ? 'pf-accent text-xs px-1 py-0.5' : 'text-sm px-3 py-2');
}
