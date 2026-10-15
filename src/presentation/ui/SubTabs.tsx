import type { ReactNode } from 'react';
import { cx } from './cx';
import ScrollRow from './ScrollRow';

interface SubTabsProps<K extends string> {
  items: { key: K; label: ReactNode; sub?: ReactNode }[];
  activeKey: K;
  onSelect: (key: K) => void;
}

// 콘텐츠 내부 보조 탭 (도감 지역 서브탭 등) — 상단 앱 탭바(pf-tabbar)보다 낮은 위계의 알약형.
// 두 줄(이름 / 보조 수치)로 그리고, 칸은 최소 너비에서 글자만큼 늘어난다(줄어들지 않는다).
// 칸이 줄 폭을 넘치면 ScrollRow가 좌우 화살표로 밀어 보여 준다(마다가스카르처럼 긴 이름 대비).
export default function SubTabs<K extends string>({ items, activeKey, onSelect }: SubTabsProps<K>) {
  return (
    <ScrollRow className="mb-1">
      {items.map(it => (
        <button
          key={it.key}
          className={cx(
            'grow shrink-0 basis-auto min-w-16 border rounded-sm px-2 py-1 text-sm cursor-pointer',
            'flex flex-col items-center leading-tight',
            it.key === activeKey
              ? 'bg-surface-2 border-gold text-gold'
              : 'bg-bg border-line text-text-dim hover:text-text',
          )}
          onClick={() => onSelect(it.key)}
        >
          <span className="whitespace-nowrap">{it.label}</span>
          {it.sub !== undefined && (
            <span className="text-2xs whitespace-nowrap opacity-80">{it.sub}</span>
          )}
        </button>
      ))}
    </ScrollRow>
  );
}
