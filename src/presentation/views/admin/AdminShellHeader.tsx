// 관리자·운영 대시보드 전용 3단 상단 크롬 (1단 Topbar · 2단 5대 탭 · 3단 서브내비)
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import LinkButton from '../../ui/LinkButton';
import PixelIcon from '../../ui/PixelIcon';
import type { GlyphId } from '../../ui/PixelIcon';
import { fmtTimeKST } from '../../../features/admin/model/metrics';
import { useAdminAuth } from '../../../features/admin/service/accessContext';
import { useAdminRefresh } from '../../../features/admin/service/useAdminQuery';
import { AdminSignOutButton, AdminStaffBadgeToggle } from './access';
import { ADMIN_TABS, sectionsForRole } from './routes';
import type { AdminTab } from './routes';
import { useAdminViewMode } from './viewMode';
import type { AdminViewMode } from './viewMode';
import MetricSwitch from './widgets/MetricSwitch';

/** 탭 아이콘 — 현황 나침반, 플레이어 열쇠, 소통·지급 봉투, 지표·밸런스 동전, 운영·콘텐츠 톱니 */
const TAB_GLYPH: Record<AdminTab, GlyphId> = {
  overview: 'compass',
  players: 'key',
  comms: 'letter',
  insights: 'coin',
  ops: 'gear',
};

const VIEW_MODE_OPTIONS: readonly { key: AdminViewMode; label: string }[] = [
  { key: 'summary', label: '요약' },
  { key: 'detail', label: '상세' },
];

export default function AdminShellHeader({
  title = '픽셀 피싱 관리자',
  activeTab,
  activeSection,
  onSelectTab,
  onSelectSection,
  subnavExtraRef,
}: {
  title?: string;
  activeTab: AdminTab;
  activeSection: string;
  onSelectTab: (tab: AdminTab) => void;
  onSelectSection: (section: string) => void;
  subnavExtraRef?: (el: HTMLDivElement | null) => void;
}) {
  const { access, role } = useAdminAuth();
  const { refreshing, lastUpdatedAt, refresh } = useAdminRefresh(access === 'granted');
  const { viewMode, setViewMode } = useAdminViewMode();
  const sections = sectionsForRole(activeTab, role);
  const lastUpdatedLabel = `마지막 조회 ${fmtTimeKST(lastUpdatedAt)}`;

  return (
    <header>
      {/* 1단: 브랜드 + 역할 배지 + 우측 전역 컨트롤 */}
      <div className="pf-admin-topbar">
        <div className="pf-admin-topbar-inner">
          <div className="pf-admin-brand">
            <span>{title}</span>
            <Badge tone={role === 'maintainer' ? 'accent' : 'gold'} size="xs">
              {role === 'maintainer' ? '운영자' : '관리자'}
            </Badge>
          </div>
          <div className="pf-admin-meta">
            <MetricSwitch
              value={viewMode}
              options={VIEW_MODE_OPTIONS}
              onChange={setViewMode}
              ariaLabel="보기 모드"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={access !== 'granted' || refreshing}
              aria-label="현재 탭 새로고침"
              title={lastUpdatedLabel}
            >
              {refreshing ? '...' : '↻'}
            </Button>
            <AdminStaffBadgeToggle />
            <LinkButton href="/" aria-label="게임으로 돌아가기" variant="ghost" className="text-sm">
              <PixelIcon glyph="exit" size={12} /> 게임으로
            </LinkButton>
            <AdminSignOutButton />
          </div>
        </div>
      </div>

      {/* 2단: 가로 1줄 5탭 내비게이션 */}
      <nav aria-label="대시보드 섹션" className="pf-admin-nav">
        <div className="pf-admin-nav-inner" role="tablist">
          {ADMIN_TABS.map(t => (
            <Button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              className="pf-admin-tab"
              onClick={() => onSelectTab(t.key)}
            >
              <PixelIcon glyph={TAB_GLYPH[t.key]} size={14} />
              <span>{t.label}</span>
            </Button>
          ))}
        </div>
      </nav>

      {/* 3단: 전폭 서브내비 바 + 우측 subnavExtra 슬롯 */}
      <div className="pf-admin-subnav">
        <div className="pf-admin-subnav-inner">
          <div className="pf-admin-subtab-list" role="tablist" aria-label="하위 구역">
            {sections.map(s => (
              <Button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={activeSection === s.key}
                className="pf-admin-subtab"
                onClick={() => onSelectSection(s.key)}
              >
                {s.label}
              </Button>
            ))}
          </div>
          <div ref={subnavExtraRef} className="flex flex-wrap items-center gap-2" />
        </div>
      </div>
    </header>
  );
}
