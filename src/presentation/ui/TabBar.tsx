import type { ReactNode } from 'react';
import { cx } from './cx';

export interface TabDef<K extends string> {
  key: K;
  label: string; // \n 포함 시 두 줄 라벨 (pf-tabbar가 pre-line 처리)
  icon?: ReactNode;
}

interface TabBarProps<K extends string> {
  tabs: TabDef<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
  className?: string;
}

// 픽셀 아이콘 + 라벨 탭바, 활성 탭은 골드 언더라인 — 앱 탭바와 모달 서브탭(계정)이 공유.
// 키를 제네릭으로 받아 TabKey에 강결합하지 않는다. 'active' 클래스는 테스트 계약(app.test).
export default function TabBar<K extends string>({ tabs, activeKey, onSelect, className }: TabBarProps<K>) {
  return (
    <div className={cx('pf-tabbar', className)}>
      {tabs.map(t => (
        <button key={t.key} className={activeKey === t.key ? 'active' : ''} onClick={() => onSelect(t.key)}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
