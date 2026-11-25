// 경제·진행 탭 — 분석 세 구역(경제, 진행, 활동)을 한 탭에 모은다. 구역은 구역 탭(SubTabs)으로 바꾸고,
// 어느 구역인지는 해시에 담긴다(화면 셸이 소유).
// 기간 전환(30일, 90일)은 daily_stats 기반의 활동 구역에만 둔다.
// 경제(events 기반)는 콜드 아카이브 정책(최근 7일 보관 한도)으로 고정하고, 진행은 현재 유저 명부 기준이다.
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
  economy: '최근 7일(이벤트 보관 한도) 골드 유입과 유출 흐름, 전체 잔고 분포를 봐요.',
  progression: '온보딩 퍼널, 배와 낚싯대 단계, 오픈월드 존 해금, 명성 게이트에서 막힌 유저를 봐요.',
  activity: '일별 집계(daily_stats) 장기 추이와 가입일 코호트 리텐션을 봐요.',
};

export default function AnalysisTab({ section, onSection }: {
  section: AnalysisSection; onSection: (section: AnalysisSection) => void;
}) {
  const [range, setRange] = useState<DayRange>('30');
  return (
    <TabPage title="경제·진행" context={CONTEXT[section]}
             aside={section === 'activity' ? (
               <MetricSwitch value={range} options={DAY_RANGE_OPTIONS} onChange={setRange}
                             ariaLabel="기간 선택" />
             ) : section === 'economy' ? (
               <span className="border border-line px-2 py-1 text-2xs text-text-dim">
                 최근 7일(이벤트 보관 한도)
               </span>
             ) : undefined}>
      <div className="max-w-[520px]">
        <SubTabs items={ADMIN_SECTIONS.analysis.map(s => ({ key: s.key, label: s.label }))}
                 activeKey={section} onSelect={onSection} />
      </div>
      {section === 'economy' && <EconomyTab />}
      {section === 'progression' && <ProgressionTab />}
      {section === 'activity' && <MetricsTab range={range} />}
    </TabPage>
  );
}
