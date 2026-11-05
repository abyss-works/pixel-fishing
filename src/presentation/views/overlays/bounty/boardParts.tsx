import type { ReactNode } from 'react';
import Button from '../../../ui/Button';
import Tip from '../../../ui/Tip';

// 수배판 카드(일반 의뢰, 네임드 토벌, 유물)가 함께 쓰는 조각.

/** 이름 왼쪽, 값 오른쪽의 줄 목록 — 카드 본문의 대상, 진행, 보상 같은 항목 */
export function BoardRows({ rows }: { rows: { key: string; label: ReactNode; value: ReactNode }[] }) {
  return (
    <ul className="list-none m-0 p-0 text-xs">
      {rows.map(r => (
        <li key={r.key} className="flex items-center justify-between gap-2 h-[26px] border-t border-line/60 first:border-t-0">
          <span className="text-text-dim shrink-0">{r.label}</span>
          <span className="min-w-0 truncate text-right">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** 수주 버튼 — 누를 수 없는 이유가 있으면 그 이유를, 없으면 수주 규칙 설명(있을 때)을 툴팁으로 보인다 */
export function AcceptButton({ disabled, reason, help, onClick }: {
  disabled: boolean; reason: string | null; help?: string; onClick: () => void;
}) {
  const button = <Button variant="primary" full disabled={disabled} onClick={onClick}>수주</Button>;
  const tip = reason ?? help;
  return tip ? <Tip wraps text={tip} className="block">{button}</Tip> : button;
}
