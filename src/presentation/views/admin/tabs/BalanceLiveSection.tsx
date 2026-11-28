// 라이브 지표 구역 — 밸런스 탭에서 시뮬레이션 위에 놓이는 실측 지표 카드들이다.
// 요약 보기에서는 경제 탭과 중복되는 골드 유입/유출을 빼고 판정 분포만 간결하게 보여준다.
import { SPOTS } from '../../../../game/content/spots';
import { boatNameOf } from '../../../../game/rules/logic';
import { BALANCE_LIVE_DAYS, useBalanceLive } from '../../../../features/admin/service/useBalanceLive';
import DataTable from '../../../ui/DataTable';
import KeyValueRow from '../../../ui/KeyValueRow';
import { fmtGold, fmtNum } from '../../../ui/format';
import { AdminCard, AdminSplit, AdminTableWrap, TabState } from '../layout';
import type { AdminViewMode } from '../viewMode';

const spotName = (id: string | null) => (id === null ? '기록 없음' : SPOTS.find(s => s.id === id)?.name ?? id);
const gold = (v: number | null) => (v === null ? '—' : fmtGold(v));
const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

export default function BalanceLiveSection({ granted, mode = 'detail' }: {
  /** 관리자 세션 여부 — 조회 상태 문구를 고른다(조회 자체는 훅이 granted일 때만 한다) */
  granted: boolean;
  mode?: AdminViewMode;
}) {
  const { data, loading, error, refresh } = useBalanceLive();
  if (!data) {
    return (
      <AdminCard title={`라이브 지표 (최근 ${BALANCE_LIVE_DAYS}일)`}>
        {granted
          ? <TabState loading={loading} error={error} onRetry={refresh} />
          : <TabState empty emptyText="운영 DB에 연결하면 실측 지표가 채워져요." />}
      </AdminCard>
    );
  }

  const judgmentCard = (
    <AdminCard title={`판정 분포 (최근 ${BALANCE_LIVE_DAYS}일)`}>
      <AdminTableWrap>
        <DataTable className="pf-admin-table">
          <thead><tr><th>판정</th><th>낚시</th><th>비율</th></tr></thead>
          <tbody>
            {data.judgment.map(r => (
              <tr key={r.judgment}><td>{r.judgment}</td><td>{fmtNum(r.catches)}</td><td>{r.pct}%</td></tr>
            ))}
          </tbody>
        </DataTable>
      </AdminTableWrap>
    </AdminCard>
  );

  if (mode === 'summary') {
    return judgmentCard;
  }

  return (
    <AdminSplit variant="2">
      {judgmentCard}

      <AdminCard title="골드">
        <div className="flex flex-col divide-y divide-line">
          <KeyValueRow label="잔고 분위" value={`${gold(data.gold.p25)} / ${gold(data.gold.p50)} / ${gold(data.gold.p75)} / ${gold(data.gold.p90)}`} />
          <KeyValueRow label="최대 잔고" value={gold(data.gold.max)} />
          <KeyValueRow label="판매 유입" value={fmtGold(data.goldFlow.sellGold)} />
          <KeyValueRow label="쿠폰 유입" value={fmtGold(data.goldFlow.couponGold)} />
          <KeyValueRow label="우편 유입" value={fmtGold(data.goldFlow.mailGold)} />
          <KeyValueRow label="현상금 유입" value={fmtGold(data.goldFlow.bountyGold)} />
          <KeyValueRow label="업적 유입" value={fmtGold(data.goldFlow.achievementGold)} />
          <KeyValueRow label="강화 유출" value={fmtGold(data.goldFlow.rodCost)} />
          <KeyValueRow label="배 유출" value={fmtGold(data.goldFlow.boatCost)} />
          <KeyValueRow label="모자 유출" value={fmtGold(data.goldFlow.hatCost)} />
        </div>
      </AdminCard>

      <AdminCard title="체류 해역">
        <AdminTableWrap>
          <DataTable className="pf-admin-table">
            <thead><tr><th>해역</th><th>낚시</th><th>사용자</th></tr></thead>
            <tbody>
              {data.spots.map(r => (
                <tr key={r.spot ?? 'none'}><td>{spotName(r.spot)}</td><td>{fmtNum(r.catches)}</td><td>{fmtNum(r.users)}</td></tr>
              ))}
            </tbody>
          </DataTable>
        </AdminTableWrap>
      </AdminCard>

      <AdminCard title="진행 분포">
        <AdminTableWrap>
          <DataTable className="pf-admin-table">
            <thead><tr><th>배</th><th>사용자</th><th>이탈(7일 미접속)</th><th>이탈 평균 명성</th></tr></thead>
            <tbody>
              {data.boats.map(r => {
                const churn = data.churn.find(c => c.boat === r.boat);
                return (
                  <tr key={r.boat}>
                    <td>{boatNameOf(r.boat, '배 없음')}</td><td>{fmtNum(r.users)}</td>
                    <td>{churn ? fmtNum(churn.users) : 0}</td><td>{churn ? fmtNum(churn.avgFame) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </AdminTableWrap>
      </AdminCard>

      <AdminCard title="낚싯대·도감 구간">
        <AdminTableWrap>
          <DataTable className="pf-admin-table">
            <thead><tr><th>구간</th><th>사용자</th></tr></thead>
            <tbody>
              {data.rodBuckets.map(r => <tr key={`rod-${r.fromLevel}`}><td>낚싯대 Lv.{r.fromLevel}~</td><td>{fmtNum(r.users)}</td></tr>)}
              {data.dexBuckets.map(r => <tr key={`dex-${r.fromSpecies}`}><td>도감 {r.fromSpecies}종~</td><td>{fmtNum(r.users)}</td></tr>)}
            </tbody>
          </DataTable>
        </AdminTableWrap>
      </AdminCard>

      <AdminCard title="바운티·이상치">
        <div className="flex flex-col divide-y divide-line">
          <KeyValueRow label="일반 수주" value={fmtNum(data.bountyFunnel.generalAccepts)} />
          <KeyValueRow label="네임드 수주" value={fmtNum(data.bountyFunnel.namedAccepts)} />
          <KeyValueRow label="흔적" value={fmtNum(data.bountyFunnel.tickets)} />
          <KeyValueRow label="결투 승·패" value={`${fmtNum(data.bountyFunnel.duelsWon)} / ${fmtNum(data.bountyFunnel.duelsLost)}`} />
          <KeyValueRow label="납품" value={fmtNum(data.bountyFunnel.delivered)} />
          <KeyValueRow label="2초 미만 연타" value={`${fmtNum(data.anomalies.fastGaps)}회, ${fmtNum(data.anomalies.fastUsers)}명`} />
          <KeyValueRow label="PERFECT 비율" value={pct(data.anomalies.perfectPct)} />
          <KeyValueRow
            label="명성 게이트 정체"
            value={data.fameGateStuck.length === 0 ? '없음'
              : data.fameGateStuck.map(r => `${boatNameOf(r.nextBoat, '')} ${fmtNum(r.users)}명`).join(', ')}
          />
        </div>
      </AdminCard>
    </AdminSplit>
  );
}
