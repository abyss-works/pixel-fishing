import type { ReactNode } from 'react';
import { cx } from './cx';
import Frame from './Frame';

// 선택 목록 — 여러 항목 중 하나를 고르는 세로 목록(listbox). 고른 행은 배경이 올라온다.
// 행 내용은 호출자가 그린다(selected를 받아 강조색을 바꿀 수 있다). 상점·프리셋 목록처럼 왼쪽 열에 둔다.
export default function SelectList<T>({ label, items, keyOf, selectedKey, onSelect, renderItem }: {
  /** 목록의 접근성 이름 */
  label: string;
  items: readonly T[];
  keyOf: (item: T) => string;
  selectedKey: string;
  onSelect: (key: string) => void;
  renderItem: (item: T, selected: boolean) => ReactNode;
}) {
  return (
    <Frame divided className="flex flex-col" role="listbox" aria-label={label}>
      {items.map(item => {
        const key = keyOf(item);
        const selected = key === selectedKey;
        return (
          <button key={key} type="button" role="option" aria-selected={selected}
                  onClick={() => onSelect(key)}
                  className={cx('flex items-center gap-3 px-3 py-3 text-left cursor-pointer transition',
                    selected ? 'bg-surface-2' : 'hover:bg-surface-2/50')}>
            {renderItem(item, selected)}
          </button>
        );
      })}
    </Frame>
  );
}
