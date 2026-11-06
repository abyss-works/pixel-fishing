import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { TabDef } from '../../ui/TabBar';
import TabBar from '../../ui/TabBar';
import { cx } from '../../ui/cx';
import { useMobileLayout } from '../useMobileLayout';
import { isSheetDragClose } from './sheet';

interface SidebarProps<K extends string> {
  tabs: TabDef<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
  /** 모바일 시트가 열려 있는가. 모바일 배치에서만 쓴다 */
  sheetOpen?: boolean;
  /** 시트 머리를 끌어 내려 닫는다 */
  onSheetClose?: () => void;
  children: ReactNode;
}

// 화면의 탭 콘텐츠를 담는 사이드 패널 레이아웃.
// 모바일 배치에서는 탭 줄(56px)이 화면 아래에 서고, 탭 내용은 그 위에서 올라오는 시트(화면 높이의 절반)에 담긴다.
export default function Sidebar<K extends string>({ tabs, activeKey, onSelect, sheetOpen = false, onSheetClose, children }: SidebarProps<K>) {
  const mobile = useMobileLayout();
  const dragFrom = useRef<number | null>(null);

  if (mobile) {
    return (
      <>
        {sheetOpen && (
          <section aria-label="탭 내용"
                   className="fixed inset-x-0 bottom-14 z-(--z-card) h-[50dvh] flex flex-col bg-surface border-t border-line">
            {/* 시트 머리 — 아래로 끌면 닫힌다 */}
            <div role="presentation" className="shrink-0 h-6 flex items-center justify-center touch-none"
                 onPointerDown={e => { dragFrom.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
                 onPointerUp={e => {
                   if (dragFrom.current !== null && isSheetDragClose(dragFrom.current, e.clientY)) onSheetClose?.();
                   dragFrom.current = null;
                 }}
                 onPointerCancel={() => { dragFrom.current = null; }}>
              <span className="block w-10 h-1 bg-line" />
            </div>
            <div className="pf-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 flex flex-col gap-2">
              {children}
            </div>
          </section>
        )}
        <aside className="shrink-0 w-full h-14 bg-surface border-t border-line">
          <TabBar tabs={tabs} activeKey={sheetOpen ? activeKey : null} onSelect={onSelect} className="h-full border-b-0" />
        </aside>
      </>
    );
  }

  return (
    <aside className={cx('w-(--sidebar-w) shrink-0 h-full flex flex-col bg-surface border-l border-line',
                         'max-[820px]:w-full max-[820px]:h-[45vh] max-[820px]:border-l-0 max-[820px]:border-t')}>
      <TabBar tabs={tabs} activeKey={activeKey} onSelect={onSelect} />
      <div className="pf-scroll flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {children}
      </div>
    </aside>
  );
}
