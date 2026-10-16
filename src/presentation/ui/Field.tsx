import type { ReactNode } from 'react';
import Note from './Note';

// 입력 필드 묶음 — 이름표 · 입력 요소 · 도움말 · 오류를 한 모양으로 쌓는다.
// 이름표가 입력 요소를 감싸므로 이름표를 누르면 입력에 초점이 간다(읽기 도구도 이름을 읽는다).
// 입력 요소는 TextInput·Select·TextArea·Slider·NumberStepper 등 공용 입력을 그대로 넣는다.
export default function Field({ label, hint, error, children }: {
  label: string;
  hint?: ReactNode;
  /** 있으면 위험색으로 아래에 붙는다 — 제출을 막은 이유 */
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-text-dim">{label}</span>
      {children}
      {hint && <Note size="xs" className="my-0">{hint}</Note>}
      {error && <Note tone="warn" size="xs" className="my-0">{error}</Note>}
    </label>
  );
}
