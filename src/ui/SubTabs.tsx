import type { ReactNode } from 'react';
import { cx } from './cx';

interface SubTabsProps<K extends string> {
  items: { key: K; label: ReactNode }[];
  activeKey: K;
  onSelect: (key: K) => void;
}

// 콘텐츠 내부 보조 탭 (도감 지역 서브탭 등) — 상단 앱 탭바(pf-tabbar)보다 낮은 위계의 알약형
export default function SubTabs<K extends string>({ items, activeKey, onSelect }: SubTabsProps<K>) {
  return (
    <div className="flex gap-1 mb-1">
      {items.map(it => (
        <button
          key={it.key}
          className={cx(
            'flex-1 border rounded-sm px-2 py-1 text-xs cursor-pointer',
            it.key === activeKey
              ? 'bg-surface-2 border-gold text-gold'
              : 'bg-bg border-line text-text-dim hover:text-text',
          )}
          onClick={() => onSelect(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
