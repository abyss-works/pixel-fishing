// 진행 구역 — 콘텐츠가 어디서 답답한지. 레이아웃: [배 단계 | 낚싯대 레벨] → [지역 도달 | 게이트 정체]
// → [바운티 퍼널(풀폭)]. **밸런스 숫자는 배 데이터를 재사용**한다 —
// 대시보드에 임계값을 새로 두지 않는다(이중 구현 금지 원칙, 액션 리듀서 머리 주석과 같은 판단).
import { useMemo } from 'react';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { adminNumber, selectProgressionDashboard } from '../../../../features/admin/model/adminViews';
import { readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { REGION_NAMES } from '../../../../features/admin/model/regions';
import { BarsChart } from '../charts';
import { Cell, CellGrid, TabState } from '../layout';
import BountyFunnelSection from './BountyFunnelSection';

// 조회 전 골격 — 아래 파생 계산이 매 렌더 다시 돌지 않도록 같은 배열을 재사용한다
const NO_USERS: AdminUserRow[] = [];

// 지역 표기는 라이브 탭과 공유하는 리터럴 미러다 — 월드 마스크 데이터를 불러오지 않는다.
// 도달 퍼널의 지역 순서는 관리자 데이터 모델이 제공한다.
export default function ProgressionTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  // 유저 명부는 라이브·유저 탭과 같은 키를 쓴다 — 한 번 받은 명부를 함께 본다
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const users = data ?? NO_USERS;

  const { boatHist, rodHist, regionReach, stalled } = useMemo(
    () => selectProgressionDashboard(users), [users],
  );

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      <CellGrid>
        {/* 분포 둘 — 같은 성격(히스토그램)이라 xl 이상에선 짝지어 나란히 */}
        <Cell title="배 단계">
          <BarsChart values={boatHist.values} labels={boatHist.labels} height={72} highlight="peak"
                     ariaLabel="배 단계별 유저 수" />
          <Note size="2xs" className="my-0">
            {granted
              ? (boatHist.legend.filter(l => l.count > 0)
                  .map(l => `${l.name} ${l.count}`).join(' · ') || '데이터가 없어요.')
              : '운영 DB에 연결하면 채워져요.'}
          </Note>
        </Cell>

        <Cell title="낚싯대 레벨">
          {rodHist.values.length > 0 ? (
            <>
              <BarsChart values={rodHist.values} labels={rodHist.labels} height={72} highlight="peak"
                         ariaLabel="낚싯대 레벨별 유저 수" />
              <Note size="2xs" className="my-0">
                Lv{rodHist.min} ~ Lv{rodHist.min + rodHist.values.length - 1}
              </Note>
            </>
          ) : (
            <Note size="2xs" className="my-0">
              {granted ? '데이터가 없어요.' : '운영 DB에 연결하면 채워져요.'}
            </Note>
          )}
        </Cell>

        <Cell title="지역 도달 (visited 기준)">
          {/* 높이는 전체 유저 대비 비율(상한 100%)이다 — 가장 큰 막대에 맞춰 늘리지 않는다 */}
          <BarsChart values={regionReach.map(r => r.sharePercent)}
                     labels={regionReach.map(r => REGION_NAMES[r.id])}
                     max={100} scaleLabel="100% = 전체 유저" height={72}
                     valueText={(_, i) => `${regionReach[i].users}/${users.length}`}
                     ariaLabel="지역별 도달한 유저 수" />
          <Note size="2xs" className="my-0">
            {regionReach.map(r => `${REGION_NAMES[r.id]} ${r.users}/${users.length}`).join(' · ')}
          </Note>
          <Note size="2xs" className="my-0">
            가본 적 있는 지역을 센 값이에요. 현재 위치가 아니라 state.visited를 기준으로 해요.
            {!granted && ' 운영 DB에 연결하면 채워져요.'}
          </Note>
        </Cell>

        <Cell title="배 명성 게이트 — 막힌 유저" flush>
          {!granted ? (
            <Note size="2xs" className="my-0 px-3 py-2">운영 DB에 연결하면 채워져요.</Note>
          ) : stalled.length === 0 ? (
            <Note size="2xs" className="my-0 px-3 py-2">모두 다음 배의 명성 하한을 넘었어요.</Note>
          ) : (
            <div className="pf-scroll-panel max-h-[320px] overflow-auto px-1">
              <DataTable>
                <thead>
                  <tr><th className="text-left">유저</th><th className="text-left">다음 배</th>
                      <th className="text-right">명성</th><th className="text-right">요구</th>
                      <th className="text-right">부족</th></tr>
                </thead>
                <tbody>
                  {stalled.map(({ user, next, deficit }) => (
                    <tr key={user.user_id}>
                      <td>{user.email ?? <span className="pf-accent text-2xs text-text-dim">{user.user_id.slice(0, 8)}…</span>}</td>
                      <td className="text-xs">{next.name}(T{next.tier})</td>
                      <td className="text-right">{fmtNum(adminNumber(user.fame))}</td>
                      <td className="text-right text-text-dim">{fmtNum(next.fameReq)}</td>
                      <td className="text-right pf-accent text-gold">{fmtNum(deficit)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </Cell>

        <BountyFunnelSection granted={granted} />
      </CellGrid>
    </>
  );
}
