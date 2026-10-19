// 이상탐지 구역 — 연타·판정 지표와 제재 현황을 확인한다. 운영 조치는 여기서 시작하고
// Sentry 두 곳으로 관측한다. 레이아웃: 신호 요약 지표 줄 → 행동 이상(연타 | PERFECT) 좌우 →
// 기록 이상(반입 | 도감 차액) 좌우 → 제재 현황 풀폭. 판정 기준(gap<2초 등)은 서버의 탐지 기준과 일치한다.
import { useMemo } from 'react';
import DataTable from '../../../ui/DataTable';
import KeyValueRow from '../../../ui/KeyValueRow';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT } from '../../../../features/admin/model/metrics';
import { adminNumber, selectAntiAbuseRows } from '../../../../features/admin/model/adminViews';
import { readAdminAntiAbuse } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, CellGrid, KpiRow, TabState } from '../layout';

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 값으로도 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminAntiAbuse>> = [[], [], [], []];

export default function AntiAbuseTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.antiAbuse, readAdminAntiAbuse, granted);

  // 유저 명부는 "uid → 식별" 라벨 풀로 쓴다 — 플래그 행에는 개인정보를 조인해 둘 수 없다
  const [users, flags, imports, mismatch] = data ?? EMPTY;

  const labelOf = (uid: string): string => {
    const u = users.find(x => x.user_id === uid);
    return u?.email ?? `${uid.slice(0, 8)}…`;
  };

  const { spamUsers, perfectOutliers, topMismatch, restricted } = useMemo(
    () => selectAntiAbuseRows(users, flags, mismatch), [users, flags, mismatch],
  );

  // 신호가 있으면 골드·경고색, 없으면 낮춘다
  const tone = (count: number, active: 'gold' | 'danger') => (count > 0 ? active : 'dim');

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      {!granted && (
        <Note className="my-0">운영 DB에 연결하거나 admins에 등록하면 채워져요. 화면 구성은 아래와 같아요.</Note>
      )}

      <KpiRow>
        <KpiTile label="연타 유저" value={fmtNum(spamUsers.length)} hint="최근 7일, 낚시 간격 2초 미만"
                 tone={tone(spamUsers.length, 'gold')} />
        <KpiTile label="PERFECT 이상치" value={fmtNum(perfectOutliers.length)} hint="7일 20낚시 이상"
                 tone={tone(perfectOutliers.length, 'danger')} />
        <KpiTile label="이사 코드 반입" value={fmtNum(imports.length)} hint="전체 반입 로그"
                 tone={tone(imports.length, 'gold')} />
        <KpiTile label="도감 차액" value={fmtNum(mismatch.length)} hint="차액이 난 도감 행"
                 tone={tone(mismatch.length, 'gold')} />
        <KpiTile label="제재 계정" value={fmtNum(restricted.length)}
                 tone={tone(restricted.length, 'danger')} />
      </KpiRow>

      {/* 행동 이상 — 낚시 간격과 판정율은 같은 "플레이 행위" 축이라 나란히 본다 */}
      <CellGrid>
        <Cell title="연타 (낚시 간격 2초 미만 · 최근 7일)">
          <Note size="2xs" className="my-0">
            입질 하한 1초에 스윕 1.4초라서 사람은 이 간격을 만들 수 없어요.
            서버에 레이트 리밋이 없어서 간격 분포가 유일한 방어 관측점이에요.
          </Note>
          <div className="overflow-x-auto">
            <DataTable>
              <thead>
                <tr><th className="text-left">유저</th><th className="text-right">7일 낚시</th>
                    <th className="text-right">연타 건수</th></tr>
              </thead>
              <tbody>
                {spamUsers.map(f => (
                  <tr key={f.user_id}>
                    <td>{labelOf(f.user_id)}</td>
                    <td className="text-right">{f.catches_7d}</td>
                    <td className={cx('text-right pf-accent',
                                      f.fast_gap_7d > 10 ? 'text-danger' : 'text-gold')}>
                      {f.fast_gap_7d}
                    </td>
                  </tr>
                ))}
                {spamUsers.length === 0 &&
                  <tr><td colSpan={3} className="text-text-dim text-center py-2">
                    {granted ? '연타가 없어요.' : '—'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Cell>

        <Cell title="PERFECT 판정 비율 이상치 (7일)">
          <Note size="2xs" className="my-0">
            30일 전체 평균은 {(flags[0]?.perfect_pct_global ?? '—')}%예요.
            PERFECT ×2는 클라이언트의 주장을 따르는 의도된 구멍이라서, 비율 감시가 유일한 대응이에요(7일 20낚시 이상).
          </Note>
          <div className="overflow-x-auto">
            <DataTable>
              <thead>
                <tr><th className="text-left">유저</th><th className="text-right">7일 PERFECT%</th>
                    <th className="text-right">30일 전체%</th><th className="text-right">7일 낚시</th></tr>
              </thead>
              <tbody>
                {perfectOutliers.map(f => (
                  <tr key={f.user_id}>
                    <td>{labelOf(f.user_id)}</td>
                    <td className="text-right text-danger pf-accent">{f.perfect_pct}%</td>
                    <td className="text-right text-text-dim">{f.perfect_pct_global}%</td>
                    <td className="text-right">{f.catches_7d}</td>
                  </tr>
                ))}
                {perfectOutliers.length === 0 &&
                  <tr><td colSpan={4} className="text-text-dim text-center py-2">
                    {granted ? '이상치가 없어요.' : '—'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Cell>
      </CellGrid>

      {/* 기록 이상 — 원장 위변조 흔적 두 축 */}
      <CellGrid>
        <Cell title="이사 코드 반입 로그">
          <Note tone="warn" size="2xs" className="my-0">
            import는 검증 없이 반입하는 운영자 전용 경로예요(2026-08-24 악용 사고).
            행이 생기면 반입 시각과 들여온 자산을 바로 확인해 주세요. 제재 절차는 운영 쿼리로 진행해요.
          </Note>
          <div className="overflow-x-auto">
            <DataTable>
              <thead>
                <tr><th className="text-left">시각</th><th className="text-left">유저</th>
                    <th className="text-right">골드</th><th className="text-right">명성</th></tr>
              </thead>
              <tbody>
                {imports.map(r => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDT(r.created_at)}</td>
                    <td>{labelOf(r.user_id)}</td>
                    <td className="text-right pf-accent text-gold">{fmtNum(adminNumber(r.gold))}</td>
                    <td className="text-right pf-accent text-gold">{fmtNum(adminNumber(r.fame))}</td>
                  </tr>
                ))}
                {imports.length === 0 &&
                  <tr><td colSpan={4} className="text-text-dim text-center py-2">
                    {granted ? '반입 이력이 없어요.' : '—'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Cell>

        <Cell title="도감↔이벤트 차액 상위">
          <Note size="2xs" className="my-0">
            v0.5.0 이전에 플레이한 기록은 이벤트 제도 이전이라 차액이 나는 게 정상이에요.
            그 <span className="pf-accent text-gold">이후에 가입한</span> 계정의 큰 차액만 위작 후보예요.
          </Note>
          <div className="overflow-x-auto">
            <DataTable>
              <thead>
                <tr><th className="text-left">유저</th><th className="text-left">어종/폼</th>
                    <th className="text-right">차액</th></tr>
              </thead>
              <tbody>
                {topMismatch.map((m, i) => (
                  <tr key={`${m.user_id}/${m.fish_id}/${m.form}/${i}`}>
                    <td>{labelOf(m.user_id)}</td>
                    <td className="pf-accent text-2xs">{m.fish_id}/{m.form}</td>
                    <td className="text-right pf-accent text-gold">+{m.missing_events}</td>
                  </tr>
                ))}
                {mismatch.length === 0 &&
                  <tr><td colSpan={3} className="text-text-dim text-center py-2">
                    {granted ? '차액이 없어요.' : '—'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Cell>
      </CellGrid>

      <Cell title="제재 계정" flush divided>
        {!granted || restricted.length === 0 ? (
          <Note size="2xs" className="my-0 px-3 py-2">
            {granted ? '활성 제재가 없어요.' : '운영 DB에 연결하면 확인할 수 있어요.'}
          </Note>
        ) : restricted.map(u => (
          <KeyValueRow key={u.user_id} label={labelOf(u.user_id)}
                       value={`골드 ${fmtNum(adminNumber(u.gold))} · 명성 ${fmtNum(adminNumber(u.fame))} · 마지막 행동 ${fmtDT(u.last_action_at)}`} />
        ))}
      </Cell>
    </>
  );
}
