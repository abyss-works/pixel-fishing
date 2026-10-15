// 유저 탭 — v_admin_users 뷰 기반 전체 명부와 행 클릭 드릴다운을 제공한다.
// 검색은 이메일·uid 부분 일치. 상세 모달이 해당 유저의 감사 정보를 보여준다:
//   스냅샷 → 액션 유형 요약 → 최근 이벤트 타임라인 → 도감↔이벤트 차액(근거 없는 도감).
import { useMemo, useState } from 'react';
import DataTable from '../../../ui/DataTable';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import PillButton from '../../../ui/PillButton';
import TextInput from '../../../ui/TextInput';
import SectionTitle from '../../../ui/SectionTitle';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT, eventSummary, EVENT_LABELS } from '../../../../features/admin/model/metrics';
import { adminNumber, filterAdminUsers, selectAdminUserDetail } from '../../../../features/admin/model/adminViews';
import { readAdminUserDetails, readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { KpiCard, TabState } from '../charts';
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
    <div className="flex flex-col gap-2">
      {/* 툴바 — 검색과 결과 카운트를 한 행에 */}
      <div className="flex items-center gap-3 flex-wrap">
        <TextInput value={query} onChange={e => setQuery(e.target.value)}
               placeholder="이메일 또는 uid로 검색"
               className="w-[240px]" aria-label="유저 검색" />
        <span className="text-2xs text-text-dim">
          {filtered.length}/{users.length}명{!granted && ' · 운영 DB 연결 후 채워진다'}
        </span>
        {error && <span className="text-2xs text-danger">조회 실패 — 재시도</span>}
        {error &&
          <PillButton type="button" onClick={refresh}>다시 시도</PillButton>}
      </div>

      {granted && loading && <TabState loading />}

      <div className="overflow-x-auto">
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
                {granted ? '검색 결과가 없다.' : '운영 DB 연결 후 유저 명부가 채워진다.'}
              </td></tr>
            )}
          </tbody>
        </DataTable>
      </div>

      {selected &&
        <UserDetail key={selected.user_id} user={selected} onClose={() => setSelected(null)} />}
    </div>
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

  // 도감↔이벤트 차액 — 이 유저의 근거 없는 도감 행(없으면 정합)

  return (
    <Modal layer="app" wide title={`유저 상세 — ${user.email ?? `${user.user_id.slice(0, 8)}…`}`}
           onClose={onClose}>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <KpiCard label="골드" value={fmtNum(adminNumber(user.gold))} />
        <KpiCard label="명성" value={fmtNum(adminNumber(user.fame))} />
        <KpiCard label="배" value={boatNameOf(user.boat ?? 0)} hint={`T${user.boat ?? 0}`} />
        <KpiCard label="낚싯대" value={`Lv${user.rod ?? '—'}`} />
        <KpiCard label="7일 PERFECT" value={flag?.perfect_pct != null ? `${flag.perfect_pct}%` : '—'}
                 hint={`30일 전체 평균 ${flag?.perfect_pct_global ?? '—'}%`} />
        <KpiCard label="제재" value={user.restricted === true ? 'ON' : '—'} />
      </div>

      <Note tone={flag && flag.fast_gap_7d > 0 ? 'warn' : 'info'}>
        가입 {fmtDT(user.signed_up_at)} · 마지막 로그인 {fmtDT(user.last_sign_in_at)} ·
        세이브 v{String(user.save_version ?? '?')} · 연타(gap&lt;2s) {(flag?.fast_gap_7d ?? 0)}건(7일)
      </Note>

      {userImports.length > 0 && (
        <Note tone="warn">
          이사 코드 반입 {userImports.length}건 —
          {userImports.map(i => ` ${fmtDT(i.created_at)} 골드 ${fmtNum(adminNumber(i.gold))}`).join(' ·')}
        </Note>
      )}

      <SectionTitle>액션 유형 요약</SectionTitle>
      <Note size="2xs" className="my-1">최근 {EVENT_WINDOW}건(window) 기준 집계</Note>
      <div className="flex flex-wrap gap-1">
        {byType.map(([type, count]) => (
          <span key={type}
                className={cx('border rounded-sm px-1.5 py-0.5 text-2xs',
                  type === 'import' || type === 'adminSet'
                    ? 'border-danger/50 text-danger' : 'border-line text-text-dim')}>
            {EVENT_LABELS[type] ?? type} ×{count}
          </span>
        ))}
        {byType.length === 0 && <span className="text-2xs text-text-dim">이벤트 없음</span>}
      </div>

      <SectionTitle>도감 ↔ 이벤트 대조 (감사 ④)</SectionTitle>
      {userMismatch.length === 0
        ? <Note size="2xs" className="my-1">차액 없음 — 도감 카운트가 catch 이벤트와 정합한다.</Note>
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
      <Note>
        v0.5.0(서버 권위 도입) 이전 플레이분은 events 제도가 없어 차액이 **정상**이다.
        가입일이 그 뒤인데 차액이 크면 근거 없는 도감.
      </Note>

      <SectionTitle>최근 이벤트 타임라인</SectionTitle>
      <TabState loading={loading} error={error} empty={events.length === 0}
                emptyText="이벤트가 없다." />
      {!loading && !error && (
        <ul className="pf-frame flex flex-col divide-y divide-line max-h-[260px] overflow-y-auto select-text">
          {events.map((e, i) => (
            <li key={e.id} className={cx('px-2 py-1 flex items-baseline gap-2 text-xs',
                                         fastGaps.has(i) && 'bg-danger/10')}>
              <span className="text-2xs text-text-dim whitespace-nowrap w-[76px] shrink-0">
                {fmtDT(e.created_at)}
              </span>
              <span className={cx('pf-accent whitespace-nowrap',
                                  DANGEROUS.has(e.type) ? 'text-danger' : 'text-gold')}>
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
      {loading && <Note size="2xs" className="my-1">타임라인 불러오는 중…</Note>}
    </Modal>
  );
}

// RPC 창 한도 — fn_user_events(p_limit)와 같은 값이어야 "N건" 문구가 거짓말이 아니게 된다
const EVENT_WINDOW = 300;

// 특별 주시 타입 — import는 운영자 전용이라 원래 희소하고, adminSet은 직접 수정 그 자체다
const DANGEROUS = new Set(['import', 'adminSet']);

/** number|string|null(DB 스칼라) → 숫자 — 표기 전용 */
