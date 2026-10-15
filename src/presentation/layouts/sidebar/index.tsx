import type { ReactNode } from 'react';
import type { TabDef } from '../../ui/TabBar';
import TabBar from '../../ui/TabBar';

interface SidebarProps<K extends string> {
  tabs: TabDef<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
  children: ReactNode;
}

// 화면의 탭 콘텐츠를 담는 사이드 패널 레이아웃.
export default function Sidebar<K extends string>({ tabs, activeKey, onSelect, children }: SidebarProps<K>) {
  return (
    <aside className="w-(--sidebar-w) shrink-0 h-full flex flex-col bg-surface border-l border-line
                      max-[820px]:w-full max-[820px]:h-[45vh] max-[820px]:border-l-0 max-[820px]:border-t">
      <TabBar tabs={tabs} activeKey={activeKey} onSelect={onSelect} />
      <div className="pf-scroll flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {children}
      </div>
    </aside>
  );
}
