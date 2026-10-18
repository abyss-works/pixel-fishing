// 라이브 지표 구역 — 밸런스 탭에서 시뮬레이션 위에 놓이는 실측 지표 칸들이다.
// 값은 관리자 서버 함수의 밸런스 라이브 지표 조회(최근 7일, 제재·빈 익명 계정 제외)에서 온다.
// 해석은 하지 않고 조회 결과를 표로 옮기기만 한다. 해역·배 이름은 게임 콘텐츠에서 읽는다.
import { SPOTS } from '../../../../game/content/spots';
import { boatNameOf } from '../../../../game/rules/logic';
import { BALANCE_LIVE_DAYS, useBalanceLive } from '../../../../features/admin/service/useBalanceLive';
import DataTable from '../../../ui/DataTable';
import KeyValueRow from '../../../ui/KeyValueRow';
import { fmtGold, fmtNum } from '../../../ui/format';
import { Cell, CellGrid, TabState } from '../layout';

const spotName = (id: string | null) => (id === null ? '기록 없음' : SPOTS.find(s => s.id === id)?.name ?? id);
const gold = (v: number | null) => (v === null ? '—' : fmtGold(v));
const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

export default function BalanceLiveSection({ granted }: {
  /** 관리자 세션 여부 — 조회 상태 문구를 고른다(조회 자체는 훅이 granted일 때만 한다) */
  granted: boolean;
}) {
  const { data, loading, error, refresh } = useBalanceLive();
  if (!data) {
    return (
      <Cell title={`라이브 지표 (최근 ${BALANCE_LIVE_DAYS}일)`}>
        {granted
          ? <TabState loading={loading} error={error} onRetry={refresh} />
          : <TabState empty emptyText="운영 DB에 연결하면 실측 지표가 채워져요." />}
      </Cell>
    );
  }
  return (
    <CellGrid>
      <Cell title={`판정 분포 (최근 ${BALANCE_LIVE_DAYS}일)`} flush>
        <DataTable>
          <thead><tr><th>판정</th><th>낚시</th><th>비율</th></tr></thead>
          <tbody>
            {data.judgment.map(r => (
              <tr key={r.judgment}><td>{r.judgment}</td><td>{fmtNum(r.catches)}</td><td>{r.pct}%</td></tr>
            ))}
          </tbody>
        </DataTable>
      </Cell>

      <Cell title="체류 해역" flush>
        <DataTable>
          <thead><tr><th>해역</th><th>낚시</th><th>사용자</th></tr></thead>
          <tbody>
            {data.spots.map(r => (
              <tr key={r.spot ?? 'none'}><td>{spotName(r.spot)}</td><td>{fmtNum(r.catches)}</td><td>{fmtNum(r.users)}</td></tr>
            ))}
          </tbody>
        </DataTable>
      </Cell>

      <Cell title="골드" divided flush>
        <KeyValueRow label="잔고 분위" value={`${gold(data.gold.p25)} · ${gold(data.gold.p50)} · ${gold(data.gold.p75)} · ${gold(data.gold.p90)}`} />
        <KeyValueRow label="최대 잔고" value={gold(data.gold.max)} />
        <KeyValueRow label="판매 유입" value={fmtGold(data.goldFlow.sellGold)} />
        <KeyValueRow label="쿠폰 유입" value={fmtGold(data.goldFlow.couponGold)} />
        <KeyValueRow label="강화 유출" value={fmtGold(data.goldFlow.rodCost)} />
        <KeyValueRow label="배 유출" value={fmtGold(data.goldFlow.boatCost)} />
        <KeyValueRow label="미끼 유출" value={fmtGold(data.goldFlow.baitCost)} />
      </Cell>

      <Cell title="진행 분포" flush>
        <DataTable>
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
      </Cell>

      <Cell title="낚싯대·도감 구간" flush>
        <DataTable>
          <thead><tr><th>구간</th><th>사용자</th></tr></thead>
          <tbody>
            {data.rodBuckets.map(r => <tr key={`rod-${r.fromLevel}`}><td>낚싯대 Lv.{r.fromLevel}~</td><td>{fmtNum(r.users)}</td></tr>)}
            {data.dexBuckets.map(r => <tr key={`dex-${r.fromSpecies}`}><td>도감 {r.fromSpecies}종~</td><td>{fmtNum(r.users)}</td></tr>)}
          </tbody>
        </DataTable>
      </Cell>

      <Cell title="바운티·이상치" divided flush>
        <KeyValueRow label="일반 수주" value={fmtNum(data.bountyFunnel.generalAccepts)} />
        <KeyValueRow label="네임드 수주" value={fmtNum(data.bountyFunnel.namedAccepts)} />
        <KeyValueRow label="흔적" value={fmtNum(data.bountyFunnel.tickets)} />
        <KeyValueRow label="결투 승·패" value={`${fmtNum(data.bountyFunnel.duelsWon)} · ${fmtNum(data.bountyFunnel.duelsLost)}`} />
        <KeyValueRow label="납품" value={fmtNum(data.bountyFunnel.delivered)} />
        <KeyValueRow label="2초 미만 연타" value={`${fmtNum(data.anomalies.fastGaps)}회 · ${fmtNum(data.anomalies.fastUsers)}명`} />
        <KeyValueRow label="PERFECT 비율" value={pct(data.anomalies.perfectPct)} />
        <KeyValueRow label="명성 게이트 정체" value={data.fameGateStuck.length === 0 ? '없음'
          : data.fameGateStuck.map(r => `${boatNameOf(r.nextBoat, '')} ${fmtNum(r.users)}명`).join(' · ')} />
      </Cell>
    </CellGrid>
  );
}
