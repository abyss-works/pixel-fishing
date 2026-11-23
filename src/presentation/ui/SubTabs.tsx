import type { ReactNode } from 'react';
import { cx } from './cx';
import { NOTCH_SM, PRESSED_BEVEL } from './notch';
import ScrollRow from './ScrollRow';

interface SubTabsProps<K extends string> {
  items: { key: K; label: ReactNode; sub?: ReactNode }[];
  activeKey: K;
  onSelect: (key: K) => void;
}

// 콘텐츠 내부 보조 탭 (도감 지역 서브탭 등) — 상단 앱 탭바(pf-tabbar)보다 낮은 위계의 노치 칩.
// 두 줄(이름 / 보조 수치)로 그리고, 칸은 최소 너비에서 글자만큼 늘어난다(줄어들지 않는다).
// 칸이 줄 폭을 넘치면 ScrollRow가 좌우 화살표로 밀어 보여 준다(마다가스카르처럼 긴 이름 대비).
// 강조는 ToggleChip의 세 단계를 따른다: 고른 칸은 완전 강조(골드), 나머지는 일반 켜짐(선 색 테두리).
export default function SubTabs<K extends string>({ items, activeKey, onSelect }: SubTabsProps<K>) {
  return (
    <ScrollRow className="mb-1">
      {items.map(it => {
        const active = it.key === activeKey;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            data-tier={active ? 'emphasis' : 'on'}
            className={cx(
              'grow shrink-0 basis-auto min-w-16 border-2 px-2 py-1 text-sm cursor-pointer transition-colors',
              'flex flex-col items-center leading-tight',
              'bg-[color-mix(in_oklab,var(--c-bg)_60%,transparent)]', NOTCH_SM, PRESSED_BEVEL,
              active ? 'border-gold text-gold' : 'border-line text-text hover:border-accent',
            )}
            onClick={() => onSelect(it.key)}
          >
            <span className="whitespace-nowrap">{it.label}</span>
            {it.sub !== undefined && (
              <span className={cx('text-2xs whitespace-nowrap', active ? 'text-gold' : 'text-text-dim')}>{it.sub}</span>
            )}
          </button>
        );
      })}
    </ScrollRow>
  );
}
