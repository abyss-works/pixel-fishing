// 라이브 탭 — "지금 누가 어디에 있는가". 실시간 접속의 정본은 없다(웹소켓/프레즌스 미구현) —
// 부팅(boot)+액션이 곧 흔적이므로 **last_action_at 신선도**로 근사한다. 10분 = 낚시 한 사이클
// 이상의 공백이면 자리 비움으로 보는 운영 판단값(balance.MIN_ACTION_GAP와 무관, 가안).
// 상용 대시보드의 Realtime 화면 축소판: 접속 추정 카드 + 현재 위치 분포 + 온라인 명부.
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtDT } from '../../../../features/admin/model/metrics';
import { ONLINE_WINDOW_MIN, selectLiveDashboard } from '../../../../features/admin/model/adminViews';
import { readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart, Frame, KpiGrid, KpiCard, TabState } from '../charts';
import { boatNameOf } from '../../../../game/content/boats';

// 조회 전 골격 — 아래 파생 계산이 매 렌더 다시 돌지 않도록 같은 배열을 재사용한다
const NO_USERS: AdminUserRow[] = [];

export default function LiveTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  // 60초마다 갱신 — 서버리스 읽기라 부담이 미미하고(친구 규모), 실시간 감각은 이 정도면 충분
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.users, readAdminUsers, granted, 60_000);
  const users = data ?? NO_USERS;
  const [tick, setTick] = useState(() => Date.now()); // n분 전 라벨 재계산 트리거

  useEffect(() => {
    if (!granted) return;
    // 라벨은 조회와 별개로 다시 계산한다 — 재조회가 같은 명부를 돌려줄 수 있다
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [granted]);

  // 신선도 버킷 — 접속중(10분) / 최근(1시간) / 금일 활동(KST 자정 기준은 탭 아래 근사: 24h 창)
  const { buckets, whereHist, regionLabel } = useMemo(
    () => selectLiveDashboard(users, tick), [users, tick],
  );

  // minAgo — 마지막 행동 'n분 전' 표시(tick 변경으로 재렌더)
  const minAgo = (iso: string | null): string => {
    if (!iso) return '—';
    const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
    if (!Number.isFinite(m)) return '—';
    return m < 1 ? '방금' : `${m}분 전`;
  };

  return (
    <div className="flex flex-col gap-3">
      <Note>
        프레즌스(websocket) 미구현이라 **last_action_at 신신도 근사**다 — 새로고침·모든 액션이
        흔적을 남기므로 열어 둔 탭도 10분 무활동이면 자리 비움으로 계산된다. 60초 갱신.
      </Note>

      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      <Frame title="접속 현황">
        <KpiGrid>
          <KpiCard label={`접속 중 (≤${ONLINE_WINDOW_MIN}분)`}
                   value={fmtN(buckets.online.length)}
                   hint="마지막 액션·부팅 기준" />
          <KpiCard label="최근 1시간" value={fmtN(buckets.recent1h.length)} />
          <KpiCard label="최근 24시간" value={fmtN(buckets.today.length)} hint="금일 활동 근사" />
          <KpiCard label="등록 유저" value={fmtN(users.length)} />
        </KpiGrid>
      </Frame>

      {/* 온라인 명부(좌)와 위치 분포(우) — xl 이상 좌우 분할 */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-3 items-start">
        <Frame title={`온라인 명부 (${buckets.online.length})`}>
          <div className="max-h-[360px] overflow-y-auto">
            <DataTable>
              <thead>
                <tr><th className="text-left">식별</th><th className="text-left">위치</th>
                    <th className="text-left">배</th><th className="text-left">마지막</th></tr>
              </thead>
              <tbody>
                {buckets.online.map(u => (
                  <tr key={u.user_id}>
                    <td>{u.email
                      ? <span className="text-xs">{u.email}</span>
                      : <span className="font-mono text-2xs text-text-dim">{u.user_id.slice(0, 8)}…</span>}</td>
                    <td className="whitespace-nowrap text-xs">
                      {regionLabel(u) ?? '—'}
                    </td>
                    <td className="whitespace-nowrap text-xs">{boatNameOf(u.boat ?? 0)}</td>
                    <td className="whitespace-nowrap text-2xs text-text-dim" title={fmtDT(u.last_action_at)}>
                      {minAgo(u.last_action_at)}
                    </td>
                  </tr>
                ))}
                {buckets.online.length === 0 &&
                  <tr><td colSpan={4} className="text-text-dim text-center py-3">
                    {granted ? `지금은 조용하다 — ${ONLINE_WINDOW_MIN}분 내 활동이 없다.` : '운영 DB 연결 후 채워진다.'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Frame>

        <Frame title="온라인 위치 분포">
          <BarsChart values={whereHist.values} labels={whereHist.labels} height={96} />
          <p className="text-2xs text-text-dim">
            접속 중 유저의 state.location 분포 — 거점은 소속 지역으로 합산한다.
          </p>
        </Frame>
      </div>
    </div>
  );
}

const fmtN = (v: number): string => Number.isFinite(v) ? String(v) : '—';
