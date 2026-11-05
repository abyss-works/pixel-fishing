import type { ReactNode } from 'react';
import Frame from './Frame';

// 메뉴 목록 — 버튼을 눌러 펼치는 세로 메뉴(menu). 줄을 누르면 그 줄의 동작을 실행한다.
// 줄 내용은 호출자가 그린다. 줄 사이에는 구분선을 긋는다.
export interface MenuListItem {
  key: string;
  /** 줄의 접근성 이름 */
  label: string;
  content: ReactNode;
  onSelect: () => void;
}

export default function MenuList({ items, className }: { items: readonly MenuListItem[]; className?: string }) {
  return (
    <Frame divided role="menu" className={className}>
      {items.map(item => (
        <button key={item.key} type="button" role="menuitem" aria-label={item.label}
                onClick={item.onSelect}
                className="flex w-full items-center text-left text-text cursor-pointer hover:bg-surface-2">
          {item.content}
        </button>
      ))}
    </Frame>
  );
}
