// 지표·밸런스 탭 — 경제·진행, 활동·리텐션, 밸런스 시뮬 세 구역을 한 탭에 모으고 요약/상세 모드를 전파한다.
import { useState } from 'react';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { AdminSubnavExtra } from '../layout';
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

export default function InsightsTab({ section }: {
  section: InsightsSection;
  onSection?: (section: InsightsSection) => void;
}) {
  const { access } = useAdminAuth();
  const { viewMode } = useAdminViewMode();
  const [range, setRange] = useState<DayRange>('30');

  return (
    <div className="flex flex-col gap-3">
      {section === 'retention' && (
        <AdminSubnavExtra>
          <MetricSwitch value={range} options={DAY_RANGE_OPTIONS} onChange={setRange} ariaLabel="기간 선택" />
        </AdminSubnavExtra>
      )}
      {section === 'economy' && (
        <AdminSubnavExtra>
          <span className="border border-line px-2 py-1 text-2xs text-text-dim">
            최근 7일(이벤트 보관 한도)
          </span>
        </AdminSubnavExtra>
      )}
      {section === 'economy' && (
        <>
          <EconomyTab mode={viewMode} />
          {viewMode === 'detail' && <ProgressionTab />}
        </>
      )}
      {section === 'retention' && <MetricsTab range={range} mode={viewMode} />}
      {section === 'sim' && (
        <>
          <BalanceLiveSection granted={access === 'granted'} mode={viewMode} />
          <FishTab mode={viewMode} />
        </>
      )}
    </div>
  );
}
