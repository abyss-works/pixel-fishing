// 밸런스 탭 — 한 쪽에 두 구역: 위는 라이브 지표(실측), 아래는 해역 시뮬레이션이다.
// 시뮬레이션은 번들 데이터만 쓰는 순수 클라 계산이라 게이트 밖이고, 라이브 지표는 granted일 때만 조회한다.
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { TabPage } from '../layout';
import BalanceLiveSection from './BalanceLiveSection';
import FishTab from './FishTab';

export default function BalanceTab() {
  const { access } = useAdminAuth();
  return (
    <TabPage title="밸런스"
             context="해역별 기대값(EV)을 시뮬레이션해요. 확정 변경은 데이터 파일(fish.ts·spots.ts)이 정본이에요.">
      <BalanceLiveSection granted={access === 'granted'} />
      <FishTab />
    </TabPage>
  );
}
