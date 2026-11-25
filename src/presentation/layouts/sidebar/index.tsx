import { createContext, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TabDef } from '../../ui/TabBar';
import TabBar from '../../ui/TabBar';
import { useMobileLayout } from '../useMobileLayout';
import { hasAppWindows, useAnyAppWindow } from '../../ui/openWindows';
import WindowSlot from '../../ui/WindowSlot';
import { isSheetDragClose } from './sheet';

const SidebarFooterContext = createContext<HTMLElement | null | undefined>(undefined);

/** 사이드바 스크롤 영역 아래 고정 footer 슬롯에 자식을 포털한다. Sidebar 밖에서는 인라인으로 그린다. */
export function SidebarFooter({ children }: { children: ReactNode }) {
  const target = useContext(SidebarFooterContext);
  if (target === undefined) return <>{children}</>;
  if (!target) return null;
  return createPortal(children, target);
}

interface SidebarProps<K extends string> {
  tabs: TabDef<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
  /** 모바일 시트가 열려 있는가. 모바일 레이아웃에서만 쓴다 */
  sheetOpen?: boolean;
  /** 시트 머리를 끌어 내려 닫는다 */
  onSheetClose?: () => void;
  children: ReactNode;
}

// 화면의 탭 콘텐츠를 담는 사이드 패널 레이아웃.
// 모바일 레이아웃에서는 탭 줄(56px)이 화면 아래에 서고, 탭 내용은 그 위에서 올라오는 시트(화면 높이의 절반)에 담긴다.
// 탭 줄과 시트는 스테이지 모달보다 위 층(tabs)이므로 스테이지 모달이 열려 있어도 자유롭게 탭을 전환하고 스크롤할 수 있다.
// 앱 전역 모달(app)이 떠 있는 동안만 배경이 되어 입력을 받지 않는다. 시트는 게임 영역과 채팅 영역을 덮는다.
// 화면 키보드가 올라와 있는 동안(루트의 data-keyboard) 탭 줄은 보이지 않게 가려지고 자리는 그대로라, 스테이지 크기가 바뀌지 않는다.
export default function Sidebar<K extends string>({ tabs, activeKey, onSelect, sheetOpen = false, onSheetClose, children }: SidebarProps<K>) {
  const mobile = useMobileLayout();
  const blocked = useAnyAppWindow();
  const dragFrom = useRef<number | null>(null);
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  // 앱 전역 모달이 떠 있을 때만 탭 입력을 막는다. 스테이지 모달은 상호 비간섭이다
  const press = (key: K) => { if (hasAppWindows()) return; onSelect(key); };

  if (mobile) {
    return (
      <SidebarFooterContext.Provider value={footerEl}>
        {sheetOpen && (
          <section aria-label="탭 내용"
                   className="fixed inset-x-0 bottom-14 z-(--z-tabs) h-[50dvh] flex flex-col bg-surface border-t border-line shadow-panel">
            {/* 시트 안에서 연 창은 창 층이 아니라 시트 바로 위에 쌓인다(WindowSlot) */}
            <WindowSlot>
              {/* 시트 머리 — 아래로 끌면 닫힌다. 모달이 떠 있으면 배경이라 입력을 받지 않는다 */}
              <div role="presentation" inert={blocked || undefined}
                   className="shrink-0 h-6 flex items-center justify-center touch-none border-b border-line/60"
                   onPointerDown={e => { dragFrom.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
                   onPointerUp={e => {
                     if (dragFrom.current !== null && isSheetDragClose(dragFrom.current, e.clientY)) onSheetClose?.();
                     dragFrom.current = null;
                   }}
                   onPointerCancel={() => { dragFrom.current = null; }}>
                <span className="block w-10 h-1 bg-text-dim" />
              </div>
              <div inert={blocked || undefined}
                   className="pf-scroll flex-1 min-h-0 pf-vscroll p-3 flex flex-col gap-2">
                {children}
              </div>
              <div ref={setFooterEl} inert={blocked || undefined} className="shrink-0" />
            </WindowSlot>
          </section>
        )}
        <aside inert={blocked || undefined} className="relative z-(--z-tabs) shrink-0 w-full h-14 bg-surface border-t border-line group-data-[keyboard]/root:invisible">
          <TabBar tabs={tabs} activeKey={sheetOpen ? activeKey : null} onSelect={press} className="h-full border-b-0" />
        </aside>
      </SidebarFooterContext.Provider>
    );
  }

  return (
    <SidebarFooterContext.Provider value={footerEl}>
      <aside inert={blocked || undefined} className="w-(--sidebar-w) shrink-0 h-full flex flex-col bg-surface border-l border-line">
        <TabBar tabs={tabs} activeKey={activeKey} onSelect={press} className="relative z-(--z-tabs)" />
        <div className="pf-scroll flex-1 min-h-0 pf-vscroll p-3 flex flex-col gap-2">
          {children}
        </div>
        <div ref={setFooterEl} inert={blocked || undefined} className="shrink-0" />
      </aside>
    </SidebarFooterContext.Provider>
  );
}
