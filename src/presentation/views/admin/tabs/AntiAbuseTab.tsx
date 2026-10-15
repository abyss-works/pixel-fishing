// 이상탐지 탭 — 연타·판정 지표와 제재 현황을 확인한다. 운영 조치는 여기서 시작하고
// Sentry 두 곳으로 관측한다. 레이아웃: 행동 이상(연타 | PERFECT) 좌우 → 기록 이상(반입 | 도감 차액)
// 좌우 → 제재 현황 풀폭. 판정 기준(gap<2초 등)은 서버의 탐지 기준과 일치한다.
import { useMemo } from 'react';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import SectionTitle from '../../../ui/SectionTitle';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT } from '../../../../features/admin/model/metrics';
import { adminNumber, selectAntiAbuseRows } from '../../../../features/admin/model/adminViews';
import { readAdminAntiAbuse } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Frame, TabState } from '../charts';

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

  return (
    <div className="flex flex-col gap-3">
      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      {!granted && (
        <Note>운영 DB 연결 또는 admins 등록 후 채워진다. 화면 구성은 아래와 같다.</Note>
      )}

      {/* 행동 이상 — 캐시 타이밍/판정율은 같은 "플레이 행위" 축이라 나란히 본다 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <Frame title="연타 (캐치 간격 &lt;2초 · 최근 7일)">
          <Note size="2xs" className="my-0">
            입질 하한 1초 + 스윕 1.4초라 인간은 물리적으로 못 만드는 간격. 서버에 레이트 리밋이
            없어 **간격 분포가 유일한 방어 관측점**(audit ⑤).
          </Note>
          <DataTable>
            <thead>
              <tr><th className="text-left">유저</th><th className="text-right">7일 캐치</th>
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
                  {granted ? '정상 — 연타 없음.' : '—'}
                </td></tr>}
            </tbody>
          </DataTable>
        </Frame>

        <Frame title="PERFECT 판정 비율 이상치 (7일)">
          <Note size="2xs" className="my-0">
            30일 전체 평균 {(flags[0]?.perfect_pct_global ?? '—')}%.
            PERFECT ×2는 클라 주장(의도된 구멍)이라 비율 감시가 유일한 대응이다(20캐치 이상).
          </Note>
          <DataTable>
            <thead>
              <tr><th className="text-left">유저</th><th className="text-right">7일 PERFECT%</th>
                  <th className="text-right">30일 전체%</th><th className="text-right">7일 캐치</th></tr>
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
                  {granted ? '이상치 없음.' : '—'}
                </td></tr>}
            </tbody>
          </DataTable>
        </Frame>
      </div>

      {/* 기록 이상 — 원장 위변조 흔적 두 축 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <Frame title="이사 코드 반입 로그">
          <Note tone="warn">
            import는 검증 없이 수입되는 **운영자 전용** 경로다(2026-08-24 악용 사고).
            여기 행이 생기면 반입 시각·들여온 자산을 즉시 본다. 제재 절차는 운영 쿼리로 한다.
          </Note>
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
                  {granted ? '반입 이력 없음.' : '—'}
                </td></tr>}
            </tbody>
          </DataTable>
        </Frame>

        <Frame title="도감↔이벤트 차액 상위">
          <Note size="2xs" className="my-0">
            v0.5.0 이전 플레이분은 정상적으로 차액이 난다(events 제도 이전).
            그 <span className="pf-accent text-gold">이후 가입</span> 계정의 큰 차액만 위작 후보다.
          </Note>
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
                  {granted ? '차액 없음.' : '—'}
                </td></tr>}
            </tbody>
          </DataTable>
        </Frame>
      </div>

      <section>
        <SectionTitle>제재 계정</SectionTitle>
        {!granted || restricted.length === 0 ? (
          <Note size="2xs" className="my-1">
            {granted ? '활성 제재 없음.' : '운영 DB 연결 후 확인한다.'}
          </Note>
        ) : (
          <ul className="flex flex-col gap-1">
            {restricted.map(u => (
              <li key={u.user_id}
                  className="pf-frame border-danger/40 px-2 py-1 text-xs select-text">
                <span className="pf-accent text-danger">{labelOf(u.user_id)}</span>
                {' '}— 골드 {fmtNum(adminNumber(u.gold))} · 명성 {fmtNum(adminNumber(u.fame))} ·
                마지막 행동 {fmtDT(u.last_action_at)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
