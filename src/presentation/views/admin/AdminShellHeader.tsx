// 관리자·운영 대시보드 공통 상단 헤더 및 탭 내비게이션
import Button from '../../ui/Button';
import LinkButton from '../../ui/LinkButton';
import PixelIcon from '../../ui/PixelIcon';
import type { GlyphId } from '../../ui/PixelIcon';
import TabBar from '../../ui/TabBar';
import { fmtTimeKST } from '../../../features/admin/model/metrics';
import { useAdminAuth } from '../../../features/admin/service/accessContext';
import { useAdminRefresh } from '../../../features/admin/service/useAdminQuery';
import { AdminSignOutButton, AdminStaffBadgeToggle } from './access';
import { ADMIN_TABS } from './routes';
import type { AdminTab } from './routes';

/** 탭 아이콘 — 개요 나침반, 실시간 해, 플레이어 열쇠(계정), 소통 봉투, 경제·진행 동전, 밸런스 물고기, 콘텐츠 책, 운영 톱니 */
const TAB_GLYPH: Record<AdminTab, GlyphId> = {
  overview: 'compass', live: 'sun', players: 'key', comms: 'letter', analysis: 'coin', balance: 'fish', content: 'book', ops: 'gear',
};

export default function AdminShellHeader({ title = '관리자 대시보드', activeTab, onSelectTab }: {
  title?: string;
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
}) {
  const { access } = useAdminAuth();
  const { refreshing, lastUpdatedAt, refresh } = useAdminRefresh(access === 'granted');
  const tabs = ADMIN_TABS.map(t => ({
    key: t.key, label: t.label, icon: <PixelIcon glyph={TAB_GLYPH[t.key]} size={16} />,
  }));

  return (
    <header className="border-b border-line bg-bg">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="pf-accent text-lg text-gold">{title}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs text-text-dim whitespace-nowrap">
            마지막 조회 {fmtTimeKST(lastUpdatedAt)}
          </span>
          <Button variant="ghost" size="sm" onClick={refresh}
                  disabled={access !== 'granted' || refreshing}
                  aria-label="현재 탭 새로고침">
            {refreshing ? '새로고침 중...' : '↻ 새로고침'}
          </Button>
          <AdminStaffBadgeToggle />
          <AdminSignOutButton />
          <LinkButton href="/" aria-label="게임으로 돌아가기" variant="ghost" className="text-sm">
            <PixelIcon glyph="exit" size={12} /> 게임으로
          </LinkButton>
        </div>
      </div>
      {/* 메뉴 탭 — 게임 사이드바와 같은 탭바. 접근성 이름은 탭 라벨 그대로 */}
      <nav aria-label="대시보드 섹션" className="mx-auto w-full max-w-[1280px] px-4">
        <TabBar tabs={tabs} activeKey={activeTab} onSelect={onSelectTab} className="border-b-0" />
      </nav>
    </header>
  );
}
