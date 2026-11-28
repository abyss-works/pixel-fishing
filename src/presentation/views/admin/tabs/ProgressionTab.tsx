// 진행 구역 — 배 단계, 낚싯대 레벨, 오픈월드 존 해금, 명성 게이트 정체, 온보딩·바운티 퍼널을 상세 보기에서 보여준다.
import { useMemo } from 'react';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { adminNumber, selectProgressionDashboard, splitDormantGuests } from '../../../../features/admin/model/adminViews';
import { useAdminAggregateUsers } from '../../../../features/admin/service/useAdminStats';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { REGION_NAMES } from '../../../../features/admin/model/regions';
import { BarsChart } from '../charts';
import { AdminCard, AdminSplit, AdminTableWrap, TabState } from '../layout';
import UserIdentity from '../UserIdentity';
import BountyFunnelSection from './BountyFunnelSection';
import OnboardingFunnelSection from './OnboardingFunnelSection';

export default function ProgressionTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { users: rawUsers, userAggregates, loading, error, refresh } = useAdminAggregateUsers();
  // 분포는 진행이 있는 계정만 센다. 휴면 게스트는 모두 출발 단계라 분포를 한쪽으로 기울인다
  const split = useMemo(() => splitDormantGuests(rawUsers), [rawUsers]);

  const { totalUsers, activePlayers, dormantGuests, boatHist, rodHist, regionReach, zoneUnlocks, stalled, stalledSummary } = useMemo(
    () => selectProgressionDashboard(split.active, userAggregates),
    [split.active, userAggregates],
  );
  const totalCount = userAggregates ? totalUsers : rawUsers.length;
  const activeCount = userAggregates ? activePlayers : split.active.length;
  const dormantCount = userAggregates ? dormantGuests : split.dormant.length;

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      {granted && !loading && !error && (totalCount > 0 || Boolean(userAggregates)) && (
        <Note size="2xs" className="my-0">
          전체 {fmtNum(totalCount)}명 중 휴면 게스트 {fmtNum(dormantCount)}명을 제외한 활성 플레이어 {fmtNum(activeCount)}명 기준이에요.
        </Note>
      )}

      <AdminSplit variant="2">
        <AdminCard title="배 단계">
          <BarsChart
            values={boatHist.values}
            labels={boatHist.labels}
            height={72}
            highlight="peak"
            ariaLabel="배 단계별 유저 수"
          />
          <Note size="2xs" className="my-0 mt-2">
            {granted
              ? (boatHist.legend.filter(l => l.count > 0)
                  .map(l => `${l.name} ${l.count}`).join(', ') || '데이터가 없어요.')
              : '운영 DB에 연결하면 채워져요.'}
          </Note>
        </AdminCard>

        <AdminCard title="낚싯대 레벨">
          {rodHist.values.length > 0 ? (
            <>
              <BarsChart
                values={rodHist.values}
                labels={rodHist.labels}
                height={72}
                highlight="peak"
                ariaLabel="낚싯대 레벨별 유저 수"
              />
              <Note size="2xs" className="my-0 mt-2">
                Lv{rodHist.min} ~ Lv{rodHist.min + rodHist.values.length - 1}
              </Note>
            </>
          ) : (
            <Note size="2xs" className="my-0">
              {granted ? '데이터가 없어요.' : '운영 DB에 연결하면 채워져요.'}
            </Note>
          )}
        </AdminCard>

        <AdminCard title="오픈월드 존 및 수배 해금">
          <BarsChart
            values={zoneUnlocks.map(z => z.sharePercent)}
            labels={zoneUnlocks.map(z => z.name)}
            max={100}
            scaleLabel="100% = 전체 유저"
            height={72}
            valueText={(_, i) => `${zoneUnlocks[i].users}/${activeCount}`}
            ariaLabel="오픈월드 존별 해금 유저 수"
          />
          <Note size="2xs" className="my-0 mt-2">
            {zoneUnlocks.map(z => `${z.name} ${z.users}/${activeCount}${z.hasBounty ? '(수배)' : ''}`).join(', ')}
          </Note>
          <Note size="2xs" className="my-0">
            {`visited 기준 현행 지역 도달: ${regionReach.map(r => `${REGION_NAMES[r.id]} ${r.users}/${activeCount}`).join(', ')}.`}
            {!granted && ' 운영 DB에 연결하면 채워져요.'}
          </Note>
        </AdminCard>

        <AdminCard title="배 명성 게이트 막힌 유저">
          {!granted ? (
            <Note size="2xs" className="my-0">운영 DB에 연결하면 채워져요.</Note>
          ) : stalled.length > 0 ? (
            <AdminTableWrap scroll>
              <DataTable className="pf-admin-table">
                <thead>
                  <tr>
                    <th className="text-left">유저</th>
                    <th className="text-left">다음 배</th>
                    <th className="text-right">명성</th>
                    <th className="text-right">요구</th>
                    <th className="text-right">부족</th>
                  </tr>
                </thead>
                <tbody>
                  {stalled.map(({ user, next, deficit }) => (
                    <tr key={user.user_id}>
                      <td><UserIdentity user={user} /></td>
                      <td className="text-xs">{next.name}(T{next.tier})</td>
                      <td className="text-right">{fmtNum(adminNumber(user.fame))}</td>
                      <td className="text-right text-text-dim">{fmtNum(next.fameReq)}</td>
                      <td className="text-right pf-accent text-gold">{fmtNum(deficit)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </AdminTableWrap>
          ) : stalledSummary.total > 0 ? (
            <AdminTableWrap scroll>
              <Note size="2xs" className="my-0 pb-2">
                총 {fmtNum(stalledSummary.total)}명이 다음 배 명성 조건에 막혀 있어요.
              </Note>
              <DataTable className="pf-admin-table">
                <thead>
                  <tr>
                    <th className="text-left">다음 배</th>
                    <th className="text-right">요구 명성</th>
                    <th className="text-right">정체 인원</th>
                  </tr>
                </thead>
                <tbody>
                  {stalledSummary.byNextTier.map(row => (
                    <tr key={row.nextTier}>
                      <td className="text-xs">{row.name}(T{row.nextTier})</td>
                      <td className="text-right text-text-dim">{fmtNum(row.fameReq)}</td>
                      <td className="text-right pf-accent text-gold">{fmtNum(row.count)}명</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </AdminTableWrap>
          ) : (
            <Note size="2xs" className="my-0">모두 다음 배의 명성 하한을 넘었어요.</Note>
          )}
        </AdminCard>

        <OnboardingFunnelSection granted={granted} />

        <BountyFunnelSection granted={granted} />
      </AdminSplit>
    </>
  );
}
