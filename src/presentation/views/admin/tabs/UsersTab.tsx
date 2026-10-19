// 명부 구역 — 전체 유저 명부와, 행을 눌러 여는 드릴다운을 제공한다.
// 검색은 이메일·uid 부분 일치. 상세 모달이 해당 유저의 감사 정보를 보여준다:
//   스냅샷 → 액션 유형 요약 → 최근 이벤트 타임라인 → 도감↔이벤트 차액(근거 없는 도감).
import { useMemo, useState } from 'react';
import DataTable from '../../../ui/DataTable';
import KeyValueRow from '../../../ui/KeyValueRow';
import KpiTile from '../../../ui/KpiTile';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import TextInput from '../../../ui/TextInput';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT, eventSummary, EVENT_LABELS, RISKY_EVENT_TYPES } from '../../../../features/admin/model/metrics';
import { adminNumber, filterAdminUsers, selectAdminUserDetail } from '../../../../features/admin/model/adminViews';
import { readAdminUserDetails, readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';
import { boatNameOf } from '../../../../game/content/boats';

// 조회 전 골격 — 아래 파생 계산이 매 렌더 다시 돌지 않도록 같은 배열을 재사용한다
const NO_USERS: AdminUserRow[] = [];

export default function UsersTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  // 유저 명부는 라이브·진행 탭과 같은 키를 쓴다 — 한 번 받은 명부를 함께 본다
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const users = data ?? NO_USERS;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

  const filtered = useMemo(() =>
    filterAdminUsers(users, query), [users, query]);

  return (
    <>
      <TabState loading={granted && loading} error={error} onRetry={refresh} />

      <Cell title="유저 명부" flush>
        {/* 툴바 — 검색과 결과 카운트를 한 행에 */}
        <div className="flex flex-wrap items-center gap-3 px-3 pt-3">
          <TextInput value={query} onChange={e => setQuery(e.target.value)}
                 placeholder="이메일 또는 uid로 검색"
                 className="w-[240px]" aria-label="유저 검색" />
          <span className="text-2xs text-text-dim">{filtered.length}/{users.length}명</span>
        </div>

        <div className="pf-scroll-panel max-h-[640px] overflow-auto px-1 pb-1">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">식별</th><th className="text-left">상태</th>
                <th className="text-right">골드</th><th className="text-right">명성</th>
                <th className="text-left">배</th><th className="text-right">낚싯대</th>
                <th className="text-left">위치</th><th className="text-left">마지막 행동</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.user_id} onClick={() => setSelected(u)}
                    className="cursor-pointer hover:bg-surface-2 transition">
                  <td>
                    {u.email
                      ? <span className="text-xs">{u.email}</span>
                      : <span className="pf-accent text-2xs text-text-dim">{u.user_id.slice(0, 8)}…</span>}
                    {u.is_anonymous === false && <span className="ml-1 text-2xs text-gold pf-accent">가입</span>}
                  </td>
                  <td>{u.restricted === true
                    ? <span className="text-danger text-2xs pf-accent">제재</span> : null}</td>
                  <td className="text-right">{fmtNum(adminNumber(u.gold))}</td>
                  <td className="text-right">{fmtNum(adminNumber(u.fame))}</td>
                  <td className="whitespace-nowrap text-xs">{boatNameOf(u.boat ?? 0)}</td>
                  <td className="text-right text-xs">{u.rod ?? '—'}</td>
                  <td className="whitespace-nowrap text-xs text-text-dim">
                    {u.location_kind ? `${u.location_kind}:${u.location_id}` : '—'}</td>
                  <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_action_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-text-dim text-center py-4">
                  {granted ? '검색 결과가 없어요.' : '운영 DB에 연결하면 유저 명부가 채워져요.'}
                </td></tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </Cell>

      {/* 상세 모달은 칸 밖에 둔다 — 오목한 칸의 clip-path 안에서는 화면 전체를 덮는 모달이 잘린다 */}
      {selected &&
        <UserDetail key={selected.user_id} user={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

// ---------- 유저 상세 (드릴다운) ----------

// 조회 전 골격 — 상세는 열릴 때 바로 조회하므로 이 값은 한 프레임만 보인다
const EMPTY_DETAIL: Awaited<ReturnType<typeof readAdminUserDetails>> = [[], [], [], []];

function UserDetail({ user, onClose }: {
  user: AdminUserRow; onClose: () => void;
}) {
  // 드릴다운은 uid별 키라 유저를 바꿔 열면 이전 조회와 섞이지 않는다
  const { data, loading, error } =
    useAdminQuery(adminKeys.userDetails(user.user_id), () => readAdminUserDetails(user.user_id), true);
  const [events, mismatch, flags, imports] = data ?? EMPTY_DETAIL;

  const { mismatch: userMismatch, flag, imports: userImports, byType, fastGaps } = useMemo(
    () => selectAdminUserDetail(user.user_id, events, mismatch, flags, imports),
    [user.user_id, events, mismatch, flags, imports],
  );

  return (
    <Modal layer="app" wide title={`유저 상세 — ${user.email ?? `${user.user_id.slice(0, 8)}…`}`}
           onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <KpiTile label="골드" value={fmtNum(adminNumber(user.gold))} />
          <KpiTile label="명성" value={fmtNum(adminNumber(user.fame))} />
          <KpiTile label="배" value={boatNameOf(user.boat ?? 0)} hint={`T${user.boat ?? 0}`} />
          <KpiTile label="낚싯대" value={`Lv${user.rod ?? '—'}`} />
          <KpiTile label="7일 PERFECT" value={flag?.perfect_pct != null ? `${flag.perfect_pct}%` : '—'}
                   hint={`30일 전체 평균 ${flag?.perfect_pct_global ?? '—'}%`} />
          <KpiTile label="제재" value={user.restricted === true ? 'ON' : '—'}
                   tone={user.restricted === true ? 'danger' : 'dim'} />
        </div>

        <Cell title="기본 정보" flush divided>
          <KeyValueRow label="가입" value={fmtDT(user.signed_up_at)} />
          <KeyValueRow label="마지막 로그인" value={fmtDT(user.last_sign_in_at)} />
          <KeyValueRow label="세이브 버전" value={`v${String(user.save_version ?? '?')}`} />
          <KeyValueRow label="연타 (간격 2초 미만, 7일)" value={
            <span className={cx(flag && flag.fast_gap_7d > 0 && 'text-danger')}>{flag?.fast_gap_7d ?? 0}건</span>
          } />
        </Cell>

        {userImports.length > 0 && (
          <Note tone="warn" className="my-0">
            이사 코드로 {userImports.length}건을 반입했어요.{' '}
            {userImports.map(i => `${fmtDT(i.created_at)} 골드 ${fmtNum(adminNumber(i.gold))}`).join(' · ')}
          </Note>
        )}

        <Cell title="액션 유형 요약">
          <div className="flex flex-wrap gap-1">
            {byType.map(([type, count]) => (
              <span key={type}
                    className={cx('border rounded-sm px-1.5 py-0.5 text-2xs',
                      RISKY_EVENT_TYPES.has(type)
                        ? 'border-danger/50 text-danger' : 'border-line text-text-dim')}>
                {EVENT_LABELS[type] ?? type} ×{count}
              </span>
            ))}
            {byType.length === 0 && <span className="text-2xs text-text-dim">이벤트가 없어요.</span>}
          </div>
          <Note size="2xs" className="my-0">최근 {EVENT_WINDOW}건을 기준으로 집계해요.</Note>
        </Cell>

        <Cell title="도감 ↔ 이벤트 대조">
          {userMismatch.length === 0
            ? <Note size="2xs" className="my-0">차액이 없어요. 도감 수가 낚시 이벤트와 맞아요.</Note>
            : (
              <DataTable>
                <thead>
                  <tr><th className="text-left">어종</th><th className="text-left">폼</th>
                      <th className="text-right">도감</th><th className="text-right">이벤트</th>
                      <th className="text-right">차액</th></tr>
                </thead>
                <tbody>
                  {userMismatch.map(m => (
                    <tr key={`${m.fish_id}/${m.form}`}>
                      <td className="pf-accent text-2xs">{m.fish_id}</td>
                      <td className="text-xs">{m.form}</td>
                      <td className="text-right">{m.dex_count}</td>
                      <td className="text-right">{m.event_count}</td>
                      <td className="text-right text-danger pf-accent">+{m.missing_events}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          <Note size="2xs" className="my-0">
            v0.5.0(서버 권위 도입) 이전에 플레이한 기록은 이벤트가 없어서 차액이 나는 게 정상이에요.
            가입일이 그 이후인데 차액이 크면 근거 없는 도감이에요.
          </Note>
        </Cell>

        <Cell title="최근 이벤트 타임라인" flush>
          {(loading || error || events.length === 0) && (
            <div className="px-3 py-2">
              <TabState loading={loading} error={error} empty={events.length === 0}
                        emptyText="이벤트가 없어요." />
            </div>
          )}
          {!loading && !error && events.length > 0 && (
            <ul className="pf-scroll-panel flex max-h-[260px] flex-col divide-y divide-line overflow-y-auto select-text">
              {events.map((e, i) => (
                <li key={e.id} className={cx('px-2 py-1 flex items-baseline gap-2 text-xs',
                                             fastGaps.has(i) && 'bg-danger/10')}>
                  <span className="text-2xs text-text-dim whitespace-nowrap w-[76px] shrink-0">
                    {fmtDT(e.created_at)}
                  </span>
                  <span className={cx('pf-accent whitespace-nowrap',
                                      RISKY_EVENT_TYPES.has(e.type) ? 'text-danger' : 'text-gold')}>
                    {EVENT_LABELS[e.type] ?? e.type}
                  </span>
                  <span className="min-w-0 truncate text-text">
                    {eventSummary(e.type, e.payload)}
                  </span>
                  {fastGaps.has(i) && <span className="ml-auto text-2xs text-danger shrink-0">연타?</span>}
                </li>
              ))}
            </ul>
          )}
        </Cell>
      </div>
    </Modal>
  );
}

// 사용자 이벤트 조회 창. 조회가 요청하는 건수(userEvents의 limit)와 같은 값이어야 "N건" 문구가 거짓말이 아니게 된다
const EVENT_WINDOW = 300;
