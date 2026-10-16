// 진행 탭 — 콘텐츠가 어디서 답답한지. 레이아웃: [배 단계 | 낚싯대 레벨] 좌우(xl) →
// [지역 도달] → [게이트 정체 목록]. **밸런스 숫자는 배 데이터를 재사용**한다 —
// 대시보드에 임계값을 새로 두지 않는다(이중 구현 금지 원칙, 액션 리듀서 머리 주석과 같은 판단).
import { useMemo } from 'react';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import SectionTitle from '../../../ui/SectionTitle';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { adminNumber, selectProgressionDashboard } from '../../../../features/admin/model/adminViews';
import { readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { REGION_NAMES } from '../../../../features/admin/model/regions';
import { BarsChart, ChartSection, TabState } from '../charts';

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
    <div className="flex flex-col gap-3">
      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      {/* 분포 셋 — 같은 성격(히스토그램)이라 xl 이상에선 짝지어 나란히 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <ChartSection title="배 단계">
          <BarsChart values={boatHist.values} labels={boatHist.labels} height={72} />
          <Note size="2xs" className="my-0">
            {granted
              ? (boatHist.legend.filter(l => l.count > 0)
                  .map(l => `${l.name} ${l.count}`).join(' · ') || '데이터 없음')
              : '운영 DB 연결 후 채워진다.'}
          </Note>
        </ChartSection>

        <ChartSection title="낚싯대 레벨">
          {rodHist.values.length > 0 ? (
            <>
              <BarsChart values={rodHist.values}
                         labels={rodHist.labels.map((l, i) =>
                           i % Math.ceil(rodHist.labels.length / 8) === 0 ? l : null)}
                         height={72} />
              <Note size="2xs" className="my-0">
                Lv{rodHist.min} ~ Lv{rodHist.min + rodHist.values.length - 1}
              </Note>
            </>
          ) : (
            <Note size="2xs" className="my-0">
              {granted ? '데이터 없음' : '운영 DB 연결 후 채워진다.'}
            </Note>
          )}
        </ChartSection>
      </div>

      <ChartSection title="지역 도달 (visited 기준)">
        <div className="flex items-end gap-4 flex-wrap px-1 pt-1">
          {regionReach.map(r => (
            <div key={r.id} className="text-center min-w-[64px]">
              <div className="h-[72px] flex items-end justify-center">
                <div className="w-14 rounded-t-[2px] bg-gold/80"
                     style={{ height: `${Math.max(r.sharePercent, r.users > 0 ? 4 : 1)}%` }} />
              </div>
              <div className="text-2xs mt-1">{REGION_NAMES[r.id]}</div>
              <div className="text-2xs text-text-dim">{r.users}/{users.length}</div>
            </div>
          ))}
        </div>
        <Note size="2xs" className="my-0">
          "가본 적 있는 지역" 집계다 — 현재 위치가 아니라 state.visited 기반.
          {' '}{!granted && '운영 DB 연결 후 채워진다.'}
        </Note>
      </ChartSection>

      <section>
        <SectionTitle>배 명성 게이트 — 막힌 유저</SectionTitle>
        {!granted ? (
          <Note size="2xs" className="my-1">운영 DB 연결 후 채워진다.</Note>
        ) : stalled.length === 0 ? (
          <Note size="2xs" className="my-1">모두 다음 배 하한을 통과 중이다.</Note>
        ) : (
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
        )}
      </section>
    </div>
  );
}
