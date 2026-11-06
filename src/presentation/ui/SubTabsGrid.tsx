import type { ReactNode } from 'react';
import { cx } from './cx';
import { NOTCH_SM, PRESSED_BEVEL } from './notch';

interface SubTabsGridProps<K extends string> {
  items: { key: K; label: ReactNode; sub?: ReactNode }[];
  activeKey: K;
  onSelect: (key: K) => void;
}

// 스크롤 없는 보조 탭 — 수평 캐러셀인 SubTabs와 달리 모든 칸을 보인다.
// 가로로 스크롤하지 않는다. 칸은 줄을 같은 폭으로 나눠 채우고, 넘치면 다음 줄로 넘긴다(모든 칸 폭이 같다).
// 두 줄(이름 / 보조 수치)로 그리며 이름은 자르지 않는다.
// 강조는 ToggleChip의 세 단계를 따른다: 고른 칸은 완전 강조(골드), 나머지는 일반 켜짐(선 색 테두리).
export default function SubTabsGrid<K extends string>({ items, activeKey, onSelect }: SubTabsGridProps<K>) {
  return (
    <div className="mb-1 grid gap-1 grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))]">
      {items.map(it => {
        const active = it.key === activeKey;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            data-tier={active ? 'emphasis' : 'on'}
            className={cx(
              'flex flex-col items-center justify-center px-2 py-1 text-sm leading-tight border-2 cursor-pointer transition-colors',
              'bg-[color-mix(in_oklab,var(--c-bg)_60%,transparent)]', NOTCH_SM, PRESSED_BEVEL,
              active ? 'border-gold text-gold' : 'border-line text-text',
            )}
            onClick={() => onSelect(it.key)}
          >
            <span className="whitespace-nowrap">{it.label}</span>
            {it.sub !== undefined && (
              <span className="text-2xs whitespace-nowrap opacity-80">{it.sub}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
