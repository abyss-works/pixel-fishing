import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { LockIcon, LockLines } from './Locked';
import Tip from './Tip';

export interface TabDef<K extends string> {
  key: K;
  label: string; // \n 포함 시 두 줄 라벨 (pf-tabbar가 pre-line 처리)
  icon?: ReactNode;
  /** 라벨 옆에 붙이는 처리할 일의 수. 0이거나 없으면 붙이지 않는다 */
  count?: number;
  /** 잠금 안내 줄. 있으면 잠긴 탭이다 - 자리를 그대로 두고 자물쇠를 붙이며 눌러도 열리지 않는다 */
  lock?: readonly string[];
}

interface TabBarProps<K extends string> {
  tabs: TabDef<K>[];
  activeKey: K | null;
  onSelect: (key: K) => void;
  className?: string;
}

// 픽셀 아이콘 + 라벨 탭바, 활성 탭은 골드 언더라인 — 앱 탭바와 모달 서브탭(계정)이 공유.
// 잠긴 탭(lock)은 흐리게 두고 자물쇠를 붙인다. 비활성(disabled)이 아니라 aria-disabled라 키보드 포커스를 받고,
// 마우스를 올리거나 포커스하거나 누르면 잠금 줄이 공용 툴팁으로 열린다. 잠금 줄은 보조 기술에도 설명으로 알린다.
// 키를 제네릭으로 받아 TabKey에 강결합하지 않는다. 'active' 클래스는 테스트 계약(app.test).
export default function TabBar<K extends string>({ tabs, activeKey, onSelect, className }: TabBarProps<K>) {
  return (
    <div className={cx('pf-tabbar', className)}>
      {tabs.map(t => t.lock && t.lock.length > 0
        ? <LockedTab key={t.key} tab={t} lines={t.lock} />
        : (
          <button key={t.key} type="button" className={activeKey === t.key ? 'active' : ''} onClick={() => onSelect(t.key)}>
            {t.icon}
            <span>{t.label}</span>
            {t.count ? <span className="pf-accent ml-1 px-1 text-2xs leading-4 bg-gold text-bg" aria-label={`${t.count}건`}>{t.count}</span> : null}
          </button>
        ))}
    </div>
  );
}

function LockedTab({ tab, lines }: { tab: TabDef<string>; lines: readonly string[] }) {
  const reasonId = useId();
  return (
    <Tip wraps pressOpens className="flex flex-1 min-w-0" text={<LockLines lines={lines} />}>
      <button type="button" aria-disabled="true" aria-describedby={reasonId} className="opacity-55 cursor-not-allowed">
        {tab.icon}
        <span className="inline-flex items-center gap-1">{tab.label}<LockIcon size={10} /></span>
      </button>
      <span id={reasonId} className="sr-only">{lines.join(' ')}</span>
    </Tip>
  );
}
