// 이상탐지 구역 — 연타·판정 지표와 제재 현황을 확인한다. 운영 조치는 여기서 시작하고
// Sentry 두 곳으로 관측한다. 레이아웃: 신호 요약 지표 줄 → 행동 이상(연타 | PERFECT) 좌우 →
// 제재 현황 풀폭. 판정 기준(gap<2초 등)은 서버의 탐지 기준과 일치한다.
import { useMemo } from 'react';
import DataTable from '../../../ui/DataTable';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import TableBox from '../../../ui/TableBox';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT } from '../../../../features/admin/model/metrics';
import { adminIdentityLookup, adminNumber, selectAntiAbuseRows } from '../../../../features/admin/model/adminViews';
import { readAdminSpamFlags, readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminSpamFlagRow, AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, CellGrid, KpiRow, TabState } from '../layout';
import UserIdentity from '../UserIdentity';

const NO_USERS: AdminUserRow[] = [];
const NO_FLAGS: AdminSpamFlagRow[] = [];

export default function AntiAbuseTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  // 유저 명부와 스팸 플래그는 전역 정규 키를 공유해 탭 전환 시 중복 풀스캔을 없앤다
  const usersQuery = useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const flagsQuery = useAdminQuery(adminKeys.spamFlags, readAdminSpamFlags, granted);
  const users = usersQuery.data ?? NO_USERS;
  const flags = flagsQuery.data ?? NO_FLAGS;
  const loading = usersQuery.loading || flagsQuery.loading;
  const error = usersQuery.error ?? flagsQuery.error;
  const refresh = () => {
    usersQuery.refresh();
    flagsQuery.refresh();
  };

  const identityOf = adminIdentityLookup(users);

  const { spamUsers, perfectOutliers, restricted } = useMemo(
    () => selectAntiAbuseRows(users, flags), [users, flags],
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
        <KpiTile label="제재 계정" value={fmtNum(restricted.length)}
                 tone={tone(restricted.length, 'danger')} />
      </KpiRow>

      {/* 행동 이상 — 낚시 간격과 판정율은 같은 "플레이 행위" 축이라 나란히 본다 */}
      <CellGrid>
        <Cell title="연타 (낚시 간격 2초 미만, 최근 7일)">
          <Note size="2xs" className="my-0">
            서버는 직전 액션과의 최소 간격(느림 창 페이싱)과 낚시 한 사이클 기준(catchTooSoon)으로 과속 요청을 차단해요.
            여기는 최근 7일 내 2초 미만 간격으로 기록된 캐치를 관측해요.
          </Note>
          <TableBox>
            <DataTable>
              <thead>
                <tr><th className="text-left">유저</th><th className="text-right">7일 낚시</th>
                    <th className="text-right">연타 건수</th></tr>
              </thead>
              <tbody>
                {spamUsers.map(f => (
                  <tr key={f.user_id}>
                    <td><UserIdentity user={identityOf(f.user_id)} /></td>
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
          </TableBox>
        </Cell>

        <Cell title="PERFECT 판정 비율 이상치 (7일)">
          <Note size="2xs" className="my-0">
            30일 전체 평균은 {(flags[0]?.perfect_pct_global ?? '—')}%예요.
            PERFECT ×2는 클라이언트의 주장을 따르는 의도된 구멍이라서, 비율 감시가 유일한 대응이에요(7일 20낚시 이상).
          </Note>
          <TableBox>
            <DataTable>
              <thead>
                <tr><th className="text-left">유저</th><th className="text-right">7일 PERFECT%</th>
                    <th className="text-right">30일 전체%</th><th className="text-right">7일 낚시</th></tr>
              </thead>
              <tbody>
                {perfectOutliers.map(f => (
                  <tr key={f.user_id}>
                    <td><UserIdentity user={identityOf(f.user_id)} /></td>
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
          </TableBox>
        </Cell>
      </CellGrid>

      <Cell title="제재 계정" flush divided>
        {!granted || restricted.length === 0 ? (
          <Note size="2xs" className="my-0 px-3 py-2">
            {granted ? '활성 제재가 없어요.' : '운영 DB에 연결하면 확인할 수 있어요.'}
          </Note>
        ) : restricted.map(u => {
          const gold = adminNumber(u.gold);
          const fame = adminNumber(u.fame);
          const details = [
            Number.isFinite(gold) ? `골드 ${fmtNum(gold)}` : null,
            Number.isFinite(fame) ? `명성 ${fmtNum(fame)}` : null,
            u.last_action_at ? `마지막 행동 ${fmtDT(u.last_action_at)}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={u.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-sm">
              <UserIdentity user={u} />
              {details && <span className="text-xs text-text-dim">{details}</span>}
            </div>
          );
        })}
      </Cell>
    </>
  );
}
