import TabIcon from './TabIcon';
import type { TabKey } from '../tabs';

interface TabBarProps {
  tabs: { key: TabKey; label: string }[];
  activeKey: TabKey;
  onSelect: (key: TabKey) => void;
}

// 상단 탭바 — 픽셀 아이콘 + 라벨, 활성 탭은 그라디언트 언더라인
export default function TabBar({ tabs, activeKey, onSelect }: TabBarProps) {
  return (
    <div className="pf-tabbar">
      {tabs.map(t => (
        <button key={t.key} className={activeKey === t.key ? 'active' : ''} onClick={() => onSelect(t.key)}>
          <TabIcon tab={t.key} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
