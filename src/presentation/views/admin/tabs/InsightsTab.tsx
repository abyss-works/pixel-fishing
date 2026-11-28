// 지표·밸런스 탭 — 경제·진행, 활동·리텐션, 밸런스 시뮬 세 구역을 한 탭에 모은다.
import { useState } from 'react';
import SubTabs from '../../../ui/SubTabs';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { TabPage } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { InsightsSection } from '../routes';
import { useAdminViewMode } from '../viewMode';
import MetricSwitch from '../widgets/MetricSwitch';
import BalanceLiveSection from './BalanceLiveSection';
import { DAY_RANGE_OPTIONS } from './dayRange';
import type { DayRange } from './dayRange';
import EconomyTab from './EconomyTab';
import FishTab from './FishTab';
import MetricsTab from './MetricsTab';
import ProgressionTab from './ProgressionTab';

const CONTEXT: Record<InsightsSection, string> = {
  economy: '최근 7일 골드 유입·유출, 온보딩 퍼널, 배·낚싯대·존 해금 진행 분포를 봐요.',
  retention: '일별 집계(daily_stats) 장기 추이와 가입일 코호트 리텐션을 봐요.',
  sim: '해역별 기대값(EV)을 시뮬레이션하고 최근 7일 라이브 지표를 함께 확인해요.',
};

export default function InsightsTab({ section, onSection }: {
  section: InsightsSection;
  onSection: (section: InsightsSection) => void;
}) {
  const { access } = useAdminAuth();
  const { viewMode } = useAdminViewMode();
  const [range, setRange] = useState<DayRange>('30');

  return (
    <TabPage
      title="지표·밸런스"
      context={CONTEXT[section]}
      aside={section === 'retention' ? (
        <MetricSwitch value={range} options={DAY_RANGE_OPTIONS} onChange={setRange} ariaLabel="기간 선택" />
      ) : section === 'economy' ? (
        <span className="border border-line px-2 py-1 text-2xs text-text-dim">
          최근 7일(이벤트 보관 한도)
        </span>
      ) : undefined}
    >
      <div className="max-w-[520px]">
        <SubTabs
          items={ADMIN_SECTIONS.insights.map(s => ({ key: s.key, label: s.label }))}
          activeKey={section}
          onSelect={onSection}
        />
      </div>
      {section === 'economy' && (
        <>
          <EconomyTab />
          {viewMode === 'detail' && <ProgressionTab />}
        </>
      )}
      {section === 'retention' && <MetricsTab range={range} />}
      {section === 'sim' && (
        <>
          <BalanceLiveSection granted={access === 'granted'} mode={viewMode} />
          <FishTab />
        </>
      )}
    </TabPage>
  );
}
