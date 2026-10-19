// 경제·진행 탭 — 분석 세 구역(경제 · 진행 · 활동)을 한 탭에 모은다. 구역은 구역 탭(SubTabs)으로 바꾸고,
// 어느 구역인지는 해시에 담긴다(화면 셸이 소유).
// 기간 전환(30일·90일)은 머리에 하나만 두고, 시계열을 그리는 경제·활동 구역이 함께 쓴다.
// 진행은 지금의 유저 명부를 기준으로 하므로 기간이 없다.
import { useState } from 'react';
import SubTabs from '../../../ui/SubTabs';
import MetricSwitch from '../widgets/MetricSwitch';
import { TabPage } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { AnalysisSection } from '../routes';
import { DAY_RANGE_OPTIONS } from './dayRange';
import type { DayRange } from './dayRange';
import EconomyTab from './EconomyTab';
import MetricsTab from './MetricsTab';
import ProgressionTab from './ProgressionTab';

const CONTEXT: Record<AnalysisSection, string> = {
  economy: '골드가 들어오고 나가는 흐름과 잔고 분포를 봐요.',
  progression: '배와 낚싯대 단계, 지역 도달, 명성 게이트에서 막힌 유저를 봐요.',
  activity: '일별 활성 유저와 가입일 기준 리텐션을 봐요.',
};

export default function AnalysisTab({ section, onSection }: {
  section: AnalysisSection; onSection: (section: AnalysisSection) => void;
}) {
  const [range, setRange] = useState<DayRange>('30');
  return (
    <TabPage title="경제·진행" context={CONTEXT[section]}
             aside={section === 'progression' ? undefined : (
               <MetricSwitch value={range} options={DAY_RANGE_OPTIONS} onChange={setRange}
                             ariaLabel="기간 선택" />
             )}>
      <div className="max-w-[520px]">
        <SubTabs items={ADMIN_SECTIONS.analysis.map(s => ({ key: s.key, label: s.label }))}
                 activeKey={section} onSelect={onSection} />
      </div>
      {section === 'economy' && <EconomyTab range={range} />}
      {section === 'progression' && <ProgressionTab />}
      {section === 'activity' && <MetricsTab range={range} />}
    </TabPage>
  );
}
