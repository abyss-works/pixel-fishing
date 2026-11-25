import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { LockIcon, LockReason, LockTip } from './Locked';

export interface TabDef<K extends string> {
  key: K;
  label: string; // \n 포함 시 두 줄 라벨 (pf-tabbar가 pre-line 처리)
  icon?: ReactNode;
  /** 라벨 옆에 붙이는 처리할 일의 수. 0이거나 없으면 붙이지 않는다 */
  count?: number;
  /** count 배지 색. 기본 gold */
  countTone?: 'gold' | 'guild';
  /** count 배지의 접근성 이름. 생략 시 `${count}건` */
  countLabel?: string;
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
            {/* 수는 라벨과 한 줄에 둔다. 버튼은 아이콘과 라벨을 세로로 쌓는다 */}
            <span className="inline-flex items-center">
              <span>{t.label}</span>
              {t.count ? (
                <span className={cx('pf-accent ml-1 px-1 text-2xs leading-4 text-bg', t.countTone === 'guild' ? 'bg-guild' : 'bg-gold')}
                      aria-label={t.countLabel ?? `${t.count}건`}>
                  {t.count}
                </span>
              ) : null}
            </span>
          </button>
        ))}
    </div>
  );
}

function LockedTab({ tab, lines }: { tab: TabDef<string>; lines: readonly string[] }) {
  const reasonId = useId();
  return (
    <LockTip title={tab.label.replace(/\n/g, ' ')} lines={lines} className="flex flex-1 min-w-0">
      <button type="button" aria-disabled="true" aria-describedby={reasonId} className="text-text-dim cursor-not-allowed">
        {tab.icon}
        <span className="inline-flex items-center gap-1">{tab.label}<LockIcon size={10} /></span>
      </button>
      <LockReason id={reasonId} lines={lines} />
    </LockTip>
  );
}
