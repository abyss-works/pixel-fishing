// 명부 구역 — 전체 유저 명부와, 행을 눌러 여는 드릴다운을 제공한다.
// 검색은 이메일·닉네임·uid 부분 일치. 진행이 없는 휴면 게스트는 기본으로 숨기고 토글로 함께 본다. 상세 모달이 해당 유저의 감사 정보와 관리 조치를 보여준다:
//   스냅샷 → 관리 조치(우편·제재·재설정 링크) → 세션 기록 → 액션 유형 요약 → 최근 이벤트 타임라인.
import { useMemo, useState } from 'react';
import Button from '../../../ui/Button';
import CheckToggle from '../../../ui/CheckToggle';
import DataTable from '../../../ui/DataTable';
import KeyValueRow from '../../../ui/KeyValueRow';
import KpiTile from '../../../ui/KpiTile';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import TextInput from '../../../ui/TextInput';
import { cx } from '../../../ui/cx';
import { useDialogs } from '../../../ui/useDialogs';
import { fmtNum, fmtDT, eventSummary, EVENT_LABELS, RISKY_EVENT_TYPES } from '../../../../features/admin/model/metrics';
import { adminNumber, adminUserLabel, filterAdminUsers, selectAdminUserDetail, splitDormantGuests } from '../../../../features/admin/model/adminViews';
import { fmtDuration } from '../../../../features/admin/model/dashboard';
import { readAdminUserDetails, readAdminUsers } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import { useAdminSessions } from '../../../../features/admin/service/useAdminStats';
import type { AdminUserRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, TabState } from '../layout';
import UserIdentity from '../UserIdentity';
import { boatNameOf } from '../../../../game/content/boats';

// 조회 전 골격 — 아래 파생 계산이 매 렌더 다시 돌지 않도록 같은 배열을 재사용한다
const NO_USERS: AdminUserRow[] = [];

export default function UsersTab({ onCompose }: {
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  // 유저 명부는 진행 구역과 같은 키를 쓴다 — 한 번 받은 명부를 함께 본다
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.users, readAdminUsers, granted);
  const users = data ?? NO_USERS;
  const [query, setQuery] = useState('');
  const [showDormant, setShowDormant] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

  const { active, dormant } = useMemo(() => splitDormantGuests(users), [users]);
  const filtered = useMemo(() =>
    filterAdminUsers(showDormant ? users : active, query), [users, active, showDormant, query]);
  // 조치 뒤 다시 읽은 명부의 행을 보인다 — 선택할 때의 행은 제재 여부가 낡을 수 있다
  const current = selected && (users.find(u => u.user_id === selected.user_id) ?? selected);

  return (
    <>
      <TabState loading={granted && loading} error={error} onRetry={refresh} />

      <Cell title="유저 명부" flush>
        {/* 툴바 — 검색과 결과 카운트를 한 행에 */}
        <div className="flex flex-wrap items-center gap-3 px-3 pt-3">
          <TextInput value={query} onChange={e => setQuery(e.target.value)}
                 placeholder="이메일·닉네임·uid로 검색"
                 className="w-[240px]" aria-label="유저 검색" />
          <span className="text-2xs text-text-dim">{filtered.length}/{users.length}명</span>
          <CheckToggle checked={showDormant} onChange={setShowDormant}
                       label={`휴면 게스트 보기 (${dormant.length}명)`} />
        </div>

        <div className="pf-scroll-panel max-h-[640px] overflow-auto px-1 pb-1">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">식별</th><th className="text-left">상태</th>
                <th className="text-right">골드</th><th className="text-right">명성</th>
                <th className="text-left">배</th><th className="text-right">낚싯대</th>
                <th className="text-left">위치</th><th className="text-left">마지막 행동</th>
                <th className="text-left">마지막 세션</th><th className="text-right">누적 플레이</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.user_id} onClick={() => setSelected(u)}
                    className="cursor-pointer hover:bg-surface-2 transition">
                  <td><UserIdentity user={u} /></td>
                  <td>{u.restricted === true
                    ? <span className="text-danger text-2xs pf-accent">제재</span> : null}</td>
                  <td className="text-right">{fmtNum(adminNumber(u.gold))}</td>
                  <td className="text-right">{fmtNum(adminNumber(u.fame))}</td>
                  <td className="whitespace-nowrap text-xs">{boatNameOf(u.boat ?? 0)}</td>
                  <td className="text-right text-xs">{u.rod ?? '—'}</td>
                  <td className="whitespace-nowrap text-xs text-text-dim">
                    {u.location_kind ? `${u.location_kind}:${u.location_id}` : '—'}</td>
                  <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_action_at)}</td>
                  <td className="whitespace-nowrap text-2xs text-text-dim">{fmtDT(u.last_session_at)}</td>
                  <td className="whitespace-nowrap text-right text-xs">{fmtDuration(u.total_session_sec)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-text-dim text-center py-4">
                  {granted ? '검색 결과가 없어요.' : '운영 DB에 연결하면 유저 명부가 채워져요.'}
                </td></tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </Cell>

      {/* 상세 모달은 칸 밖에 둔다 — 오목한 칸의 clip-path 안에서는 화면 전체를 덮는 모달이 잘린다 */}
      {current &&
        <UserDetail key={current.user_id} user={current} onClose={() => setSelected(null)} onCompose={onCompose} />}
    </>
  );
}

// ---------- 유저 상세 (드릴다운) ----------

// 조회 전 골격 — 상세는 열릴 때 바로 조회하므로 이 값은 한 프레임만 보인다
const EMPTY_DETAIL: Awaited<ReturnType<typeof readAdminUserDetails>> = [[], []];

function UserDetail({ user, onClose, onCompose }: {
  user: AdminUserRow; onClose: () => void; onCompose: (userId: string) => void;
}) {
  // 드릴다운은 uid별 키라 유저를 바꿔 열면 이전 조회와 섞이지 않는다
  const { data, loading, error } =
    useAdminQuery(adminKeys.userDetails(user.user_id), () => readAdminUserDetails(user.user_id), true);
  const [events, flags] = data ?? EMPTY_DETAIL;

  const { flag, byType, fastGaps } = useMemo(
    () => selectAdminUserDetail(user.user_id, events, flags),
    [user.user_id, events, flags],
  );
  // 확인 창은 모달의 형제로 그린다 — 모달 상자 안에 두면 상자의 스크롤 영역에 갇힌다
  const { confirm, dialogs } = useDialogs();

  return (
    <>
      <Modal layer="app" wide title={`유저 상세 — ${adminUserLabel(user)}`}
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

          <UserActions user={user} onCompose={onCompose} confirm={confirm} />

          <UserSessions user={user} />

          <Cell title="기본 정보" flush divided>
            <KeyValueRow label="계정 id" value={<span className="pf-accent text-xs select-text">{user.user_id}</span>} />
            <KeyValueRow label="가입" value={fmtDT(user.signed_up_at)} />
            <KeyValueRow label="마지막 로그인" value={fmtDT(user.last_sign_in_at)} />
            <KeyValueRow label="세이브 버전" value={`v${String(user.save_version ?? '?')}`} />
            <KeyValueRow label="연타 (간격 2초 미만, 7일)" value={
              <span className={cx(flag && flag.fast_gap_7d > 0 && 'text-danger')}>{flag?.fast_gap_7d ?? 0}건</span>
            } />
          </Cell>

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

          <Cell title="최근 이벤트 타임라인" flush>
            {(loading || error || events.length === 0) && (
              <div className="px-3 py-2">
                <TabState loading={loading} error={error} empty={events.length === 0}
                          emptyText="이벤트가 없어요." />
              </div>
            )}
            {!loading && !error && events.length > 0 && (
              <ul className="pf-scroll-panel flex max-h-[260px] flex-col divide-y divide-line pf-vscroll select-text">
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
      {dialogs}
    </>
  );
}

// 사용자 이벤트 조회 창. 조회가 요청하는 건수(userEvents의 limit)와 같은 값이어야 "N건" 문구가 거짓말이 아니게 된다
const EVENT_WINDOW = 300;

// ---------- 세션 기록 ----------

// 상세에 보이는 최근 세션 건수
const SESSION_WINDOW = 30;

/** 누적 플레이 시간과 마지막 세션, 최근 세션 목록(시작 시각·길이) */
function UserSessions({ user }: { user: AdminUserRow }) {
  const { data, loading, error } = useAdminSessions(user.user_id, SESSION_WINDOW);
  const sessions = data ?? [];
  return (
    <Cell title="세션 기록" flush divided>
      <KeyValueRow label="누적 플레이" value={fmtDuration(user.total_session_sec)} />
      <KeyValueRow label="마지막 세션 종료" value={fmtDT(user.last_session_at)} />
      {(loading || error || sessions.length === 0) ? (
        <div className="px-3 py-2">
          <TabState loading={loading} error={error} empty={sessions.length === 0} emptyText="세션 기록이 없어요." />
        </div>
      ) : (
        <div className="pf-scroll-panel max-h-[220px] pf-vscroll px-1">
          <DataTable>
            <thead>
              <tr><th className="text-left">시작</th><th className="text-left">끝</th><th className="text-right">길이</th></tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDT(s.startedAt)}</td>
                  <td className="whitespace-nowrap text-xs text-text-dim">{fmtDT(s.endedAt)}</td>
                  <td className="whitespace-nowrap text-right text-xs">{fmtDuration(s.durationSec)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Note size="2xs" className="my-0 px-2 pb-2">최근 {SESSION_WINDOW}건까지 보여요.</Note>
        </div>
      )}
    </Cell>
  );
}

// ---------- 관리 조치 ----------

/** 우편 보내기, 제재·해제(확인을 거친다), 가입 계정의 비밀번호 재설정 링크 발급 */
function UserActions({ user, onCompose, confirm }: {
  user: AdminUserRow; onCompose: (userId: string) => void;
  confirm: ReturnType<typeof useDialogs>['confirm'];
}) {
  const actions = useAdminUserActions();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const restricted = user.restricted === true;
  const member = user.is_anonymous === false;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
    } catch (e) {
      setFailure(String((e as { message?: unknown }).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const toggleRestrict = async () => {
    const ok = await confirm(restricted
      ? { layer: 'app', title: '제재 해제', confirmLabel: '해제하기',
          body: `${adminUserLabel(user)} 계정의 제재를 풀어요. 다시 게임을 진행할 수 있어요.` }
      : { layer: 'app', title: '계정 제재', confirmLabel: '제재하기',
          body: `${adminUserLabel(user)} 계정의 게임 진행을 막아요. 자산과 기록은 그대로 남고, 나중에 해제할 수 있어요.` });
    if (ok) await run(() => actions.restrict(user.user_id, !restricted));
  };

  const issueLink = () => run(async () => {
    setCopied(false);
    setLink(await actions.resetLink(user.user_id));
  });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setFailure('복사하지 못했어요. 주소 칸을 눌러 직접 복사해 주세요.');
    }
  };

  return (
    <Cell title="관리 조치">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onCompose(user.user_id)}>우편 보내기</Button>
        <Button size="sm" disabled={busy || user.restricted === null}
                onClick={() => void toggleRestrict()}>{restricted ? '제재 해제' : '제재'}</Button>
        <Button size="sm" disabled={busy || !member} onClick={() => void issueLink()}>재설정 링크 만들기</Button>
      </div>
      {user.restricted === null && <Note size="2xs" className="my-0">저장 상태가 없는 계정은 제재할 수 없어요.</Note>}
      {!member && <Note size="2xs" className="my-0">게스트 계정은 비밀번호가 없어서 재설정 링크를 만들 수 없어요.</Note>}
      {failure && <Note tone="warn" className="my-0">{failure}</Note>}
      {link && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <TextInput readOnly value={link.url} aria-label="재설정 링크" className="min-w-0 flex-1 font-mono text-xs"
                       onFocus={e => e.currentTarget.select()} />
            <Button size="sm" onClick={() => void copy()}>{copied ? '복사됨' : '복사'}</Button>
          </div>
          <Note size="2xs" className="my-0">
            {`${fmtDT(link.expiresAt)}까지 한 번 쓸 수 있어요. 메일은 보내지 않았어요. 플레이어에게 직접 전해 주세요.`}
          </Note>
        </div>
      )}
    </Cell>
  );
}
