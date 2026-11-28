import type { ReactNode } from 'react';
import Frame from './Frame';
import Locked from './Locked';

// 메뉴 목록 — 버튼을 눌러 펼치는 세로 메뉴(menu). 줄을 누르면 그 줄의 동작을 실행한다.
// 줄 내용은 호출자가 그린다. 줄 사이에는 구분선을 긋는다.
// 잠긴 줄(lock)은 공용 잠금 요소로 그린다. 자리는 그대로 두고 눌러도 동작하지 않으며 잠금 줄이 툴팁으로 열린다.
// 자물쇠는 줄 안의 자기 자리(content)에 호출자가 LockIcon으로 둔다.
export interface MenuListItem {
  key: string;
  /** 줄의 접근성 이름 */
  label: string;
  content: ReactNode;
  onSelect: () => void;
  /** 잠금 안내 줄들. 있으면 줄이 잠긴다 */
  lock?: readonly string[];
}

export interface MenuListGroup {
  key: string;
  label: string;
  items: readonly MenuListItem[];
}

function renderItem(item: MenuListItem) {
  return item.lock ? (
    <Locked key={item.key} role="menuitem" title={item.label} lines={item.lock} label={item.label} badge={false}>{item.content}</Locked>
  ) : (
    <button key={item.key} type="button" role="menuitem" aria-label={item.label}
            onClick={item.onSelect}
            className="flex w-full items-center text-left text-text cursor-pointer hover:bg-surface-2">
      {item.content}
    </button>
  );
}

export default function MenuList({ items, groups, className }: {
  items?: readonly MenuListItem[];
  groups?: readonly MenuListGroup[];
  className?: string;
}) {
  if (groups) {
    return (
      <Frame role="menu" className={className}>
        {groups.map((group, idx) => (
          <div key={group.key} className={idx > 0 ? 'mt-1 border-t border-line/60 pt-1' : undefined}>
            <div className="px-2 pt-1 pb-0.5 text-2xs text-text-dim select-none">{group.label}</div>
            <div className="divide-y divide-line/40">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </Frame>
    );
  }
  return (
    <Frame divided role="menu" className={className}>
      {(items ?? []).map(renderItem)}
    </Frame>
  );
}
