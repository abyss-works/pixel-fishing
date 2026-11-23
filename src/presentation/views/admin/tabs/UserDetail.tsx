// 유저 상세 모달 — 스냅샷, 관리 조치(우편, 제재, 재설정 링크, 세션 강제 종료), 세션 기록, 게임 상태 상세, 이벤트 타임라인.
import { useMemo, useState } from 'react';
import Button from '../../../ui/Button';
import DataTable from '../../../ui/DataTable';
import KeyValueRow from '../../../ui/KeyValueRow';
import KpiTile from '../../../ui/KpiTile';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import TableBox from '../../../ui/TableBox';
import TextInput from '../../../ui/TextInput';
import { cx } from '../../../ui/cx';
import { useDialogs } from '../../../ui/useDialogs';
import { adminGradeName, fmtNum, fmtDT, eventSummary, EVENT_LABELS, formatAdminEnergy, RISKY_EVENT_TYPES } from '../../../../features/admin/model/metrics';
import { adminBoatName, adminNumber, adminUserLabel, selectAdminUserDetail } from '../../../../features/admin/model/adminViews';
import { fmtDuration } from '../../../../features/admin/model/dashboard';
import { REGION_NAMES, formatAdminLocation } from '../../../../features/admin/model/regions';
import { readAdminSpamFlags, readAdminUserEvents, readAdminUserState } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminUserActions } from '../../../../features/admin/service/useAdminUserActions';
import { useAdminSessions } from '../../../../features/admin/service/useAdminStats';
import type { AdminEventRow, AdminSpamFlagRow, AdminUserRow, AdminUserState } from '../../../../features/admin/model/types';
import { Cell, TabState } from '../layout';

// 사용자 이벤트 조회 창. 조회가 요청하는 건수(userEvents의 limit)와 같은 값이어야 "N건" 문구가 거짓말이 아니게 된다
const EVENT_WINDOW = 300;
// 상세에 보이는 최근 세션 건수
const SESSION_WINDOW = 30;
const EMPTY_EVENTS: AdminEventRow[] = [];
const EMPTY_FLAGS: AdminSpamFlagRow[] = [];

export default function UserDetail({ user, onClose, onCompose }: {
  user: AdminUserRow;
  onClose: () => void;
  onCompose?: (userId: string) => void;
}) {
  // 이벤트는 uid별 키, 스팸 플래그는 전역 공유 키를 사용해 중복 풀스캔을 피한다
  const eventsQuery = useAdminQuery(
    adminKeys.userEvents(user.user_id),
    () => readAdminUserEvents(user.user_id),
    true,
  );
  const flagsQuery = useAdminQuery(adminKeys.spamFlags, readAdminSpamFlags, true);
  const stateQuery = useAdminQuery(
    adminKeys.userState(user.user_id),
    () => readAdminUserState(user.user_id),
    true,
  );
  const events = eventsQuery.data ?? EMPTY_EVENTS;
  const flags = flagsQuery.data ?? EMPTY_FLAGS;
  const loading = eventsQuery.loading || flagsQuery.loading;
  const error = eventsQuery.error ?? flagsQuery.error;

  const { flag, byType, fastGaps } = useMemo(
    () => selectAdminUserDetail(user.user_id, events, flags),
    [user.user_id, events, flags],
  );
  // 확인 창은 모달의 형제로 그린다 — 모달 상자 안에 두면 상자의 스크롤 영역에 갇힌다
  const { confirm, dialogs } = useDialogs();

  return (
    <>
      <Modal layer="app" wide title={`유저 상세: ${adminUserLabel(user)}`} onClose={onClose}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <KpiTile label="골드" value={fmtNum(adminNumber(user.gold))} />
            <KpiTile label="명성" value={fmtNum(adminNumber(user.fame))} />
            <KpiTile label="배" value={adminBoatName(user.boat ?? 0)} hint={`T${user.boat ?? 0}`} />
            <KpiTile label="낚싯대" value={`Lv${user.rod ?? '없음'}`} />
            <KpiTile label="7일 PERFECT" value={flag?.perfect_pct != null ? `${flag.perfect_pct}%` : '없음'}
                     hint={`30일 전체 평균 ${flag?.perfect_pct_global ?? '없음'}%`} />
            <KpiTile label="제재" value={user.restricted === true ? 'ON' : 'OFF'}
                     tone={user.restricted === true ? 'danger' : 'dim'} />
          </div>

          <UserActions user={user} onCompose={onCompose} confirm={confirm} />

          <UserSessions user={user} />

          <Cell title="기본 정보" flush divided>
            <KeyValueRow label="계정 id" value={<span className="pf-accent text-xs select-text">{user.user_id}</span>} />
            <KeyValueRow label="위치" value={formatAdminLocation({ kind: user.location_kind, id: user.location_id })} />
            <KeyValueRow label="가입" value={fmtDT(user.signed_up_at)} />
            <KeyValueRow label="마지막 로그인" value={fmtDT(user.last_sign_in_at)} />
            <KeyValueRow label="세이브 버전" value={`v${String(user.save_version ?? '?')}`} />
            <KeyValueRow label="연타 (간격 2초 미만, 7일)" value={
              <span className={cx(flag && flag.fast_gap_7d > 0 && 'text-danger')}>{flag?.fast_gap_7d ?? 0}건</span>
            } />
          </Cell>

          <UserStateCell state={stateQuery.data} loading={stateQuery.loading} error={stateQuery.error}
                         onRetry={stateQuery.refresh} />

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

// ---------- 게임 상태 상세 ----------

function UserStateCell({ state, loading, error, onRetry }: {
  state: AdminUserState | null; loading: boolean; error: string | null; onRetry: () => void;
}) {
  const counterEntries = state ? Object.entries(state.achievements.counters) : [];
  const hatItems = state?.hats.items ?? [];
  const equippedHatId = state?.hats.equipped?.id ?? null;
  const recentBag = state?.instances.recentBag ?? [];
  const progression = state?.progression;

  return (
    <Cell title="게임 상태" flush divided>
      {(loading || error) && !state ? (
        <div className="px-3 py-2">
          <TabState loading={loading} error={error} onRetry={onRetry} />
        </div>
      ) : state ? (
        <>
          {!state.hasSave && (
            <Note size="2xs" className="my-0 px-3 py-2">저장 상태가 아직 없어요.</Note>
          )}
          <KeyValueRow
            label="도감 현황"
            value={`일반 ${state.dex.normal}/${state.dex.normalTotal}, 돌연변이 ${state.dex.variant}/${state.dex.variantTotal}, 네임드 ${state.dex.named}/${state.dex.namedTotal}`}
          />
          <KeyValueRow
            label="네임드 토벌"
            value={`${fmtNum(state.bounty.namedClears)}회 (${state.bounty.namedDistinctClears}/${state.bounty.namedTotal}종)`}
          />
          <KeyValueRow
            label={`보유 유물 (${state.artifacts.owned.length}/${state.artifacts.total})`}
            value={state.artifacts.owned.length === 0 ? '없음' : (
              <span className="flex flex-wrap justify-end gap-1">
                {state.artifacts.owned.map(a => (
                  <span key={a.id} className="border border-line rounded-sm px-1.5 py-0.5 text-2xs">
                    {a.name}
                    <span className="text-text-dim ml-1">
                      ({a.id}{a.grade ? `, ${adminGradeName(a.grade)}` : ''}{a.level !== null ? ` Lv.${a.level}` : ''})
                    </span>
                  </span>
                ))}
              </span>
            )}
          />
          <KeyValueRow
            label={`보유 모자 (${state.hats.owned}/${state.hats.total})`}
            value={hatItems.length === 0 ? '없음' : (
              <span className="flex flex-wrap justify-end gap-1">
                {hatItems.map(h => (
                  <span key={h.id} className={cx('border rounded-sm px-1.5 py-0.5 text-2xs',
                    equippedHatId === h.id ? 'border-gold text-gold' : 'border-line')}>
                    {h.name}
                    <span className="text-text-dim ml-1">
                      ({h.source === 'gold' ? '골드' : '업적'}{equippedHatId === h.id ? ', 착용 중' : ''})
                    </span>
                  </span>
                ))}
              </span>
            )}
          />
          <KeyValueRow
            label="업적 수령"
            value={`${state.achievements.claimed}/${state.achievements.total}개${state.achievements.claimable > 0 ? ` (수령 가능 ${state.achievements.claimable})` : ''}`}
          />
          <KeyValueRow
            label="업적 카운터"
            value={counterEntries.length === 0 ? '기록 없음' : (
              <span className="flex flex-wrap justify-end gap-1">
                {counterEntries.map(([k, v]) => (
                  <span key={k} className="border border-line rounded-sm px-1.5 py-0.5 text-2xs">
                    {k} {fmtNum(v)}
                  </span>
                ))}
              </span>
            )}
          />
          <KeyValueRow
            label="기운 4종"
            value={`일반 ${formatAdminEnergy(state.cooking.energy.common)}, 희귀 ${formatAdminEnergy(state.cooking.energy.rare)}, 영웅 ${formatAdminEnergy(state.cooking.energy.epic)}, 전설 ${formatAdminEnergy(state.cooking.energy.legendary)}`}
          />
          <KeyValueRow
            label="보유 요리"
            value={[
              state.cooking.cooked.length > 0
                ? state.cooking.cooked.map(c => `${c.name} ×${c.count}`).join(', ')
                : '없음',
              state.cooking.inProgress ? `조리 중: ${state.cooking.inProgress.name} ×${state.cooking.inProgress.count}` : null,
            ].filter(Boolean).join(', ')}
          />
          <KeyValueRow
            label="활성 슬롯"
            value={`도시락 ${state.cooking.slots.lunch ? `${state.cooking.slots.lunch.name} (${fmtDT(state.cooking.slots.lunch.endsAt)}까지)` : '비어 있음'}, 미끼 ${state.cooking.slots.bait ? `${state.cooking.slots.bait.name} (${fmtDT(state.cooking.slots.bait.endsAt)}까지)` : '비어 있음'}`}
          />
          <KeyValueRow label="가방, 전시 개체" value={`가방 ${fmtNum(state.instances.bag)}마리, 전시 ${fmtNum(state.instances.exhibit)}마리`} />
          <KeyValueRow
            label={`최근 잡은 가방 어종 (${recentBag.length})`}
            value={recentBag.length === 0 ? '없음' : (
              <span className="flex flex-wrap justify-end gap-1">
                {recentBag.map(f => (
                  <span key={f.uid} className="border border-line rounded-sm px-1.5 py-0.5 text-2xs">
                    {f.name}{f.form === 'variant' ? '(돌연변이)' : ''}
                    {f.size !== null ? ` ${f.size.toFixed(1)}cm` : ''}
                    {f.spot ? ` (${f.spot})` : ''}
                    {f.locked ? ' [잠금]' : ''}
                  </span>
                ))}
              </span>
            )}
          />
          {progression && (
            <>
              <KeyValueRow label="활성 로그인 세션" value={`${fmtNum(progression.activeSessions)}건`} />
              <KeyValueRow
                label="방문 지역"
                value={progression.visited.length === 0
                  ? '없음'
                  : progression.visited.map(v => REGION_NAMES[v] ?? v).join(', ')}
              />
              <KeyValueRow
                label={`사용 쿠폰 (${progression.coupons.length})`}
                value={progression.coupons.length === 0 ? '없음' : progression.coupons.join(', ')}
              />
              <KeyValueRow
                label={`진행 중 수배 (${progression.bountyProgress.length})`}
                value={progression.bountyProgress.length === 0 ? '없음' : (
                  <span className="flex flex-wrap justify-end gap-1">
                    {progression.bountyProgress.map(b => (
                      <span key={b.questId} className="border border-line rounded-sm px-1.5 py-0.5 text-2xs">
                        {b.zone} {b.questId} ({b.progress}/{b.target ?? '?'})
                      </span>
                    ))}
                  </span>
                )}
              />
              <KeyValueRow
                label={`활성 도전권 (${progression.bountyTickets.length})`}
                value={progression.bountyTickets.length === 0 ? '없음'
                  : progression.bountyTickets.map(t => `${t.questId} (${fmtDT(t.issuedAt)})`).join(', ')}
              />
            </>
          )}
        </>
      ) : null}
    </Cell>
  );
}

// ---------- 세션 기록 ----------

/** 누적 플레이 시간과 마지막 세션, 최근 세션 목록(시작 시각, 길이) */
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
        <TableBox className="max-h-[220px] px-1">
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
        </TableBox>
      )}
    </Cell>
  );
}

// ---------- 관리 조치 ----------

/** 우편 보내기, 제재/해제, 가입 계정의 비밀번호 재설정 링크 발급, 활성 세션 강제 종료 */
function UserActions({ user, onCompose, confirm }: {
  user: AdminUserRow;
  onCompose?: (userId: string) => void;
  confirm: ReturnType<typeof useDialogs>['confirm'];
}) {
  const actions = useAdminUserActions();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const restricted = user.restricted === true;
  const member = user.is_anonymous === false;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    setNotice(null);
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

  const revokeAllSessions = async () => {
    const ok = await confirm({
      layer: 'app',
      title: '세션 강제 종료',
      confirmLabel: '종료하기',
      body: `${adminUserLabel(user)} 계정의 활성 로그인 세션을 모두 종료해요. 진행 중인 게임과 관리자 세션이 풀려요.`,
    });
    if (ok) {
      await run(async () => {
        const res = await actions.revokeSessions(user.user_id);
        setNotice(`활성 세션 ${res.revoked}건을 종료했어요.`);
      });
    }
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
        {onCompose && <Button size="sm" onClick={() => onCompose(user.user_id)}>우편 보내기</Button>}
        <Button size="sm" disabled={busy || user.restricted === null}
                onClick={() => void toggleRestrict()}>{restricted ? '제재 해제' : '제재'}</Button>
        <Button size="sm" disabled={busy || !member} onClick={() => void issueLink()}>재설정 링크 만들기</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revokeAllSessions()}>세션 강제 종료</Button>
      </div>
      {user.restricted === null && <Note size="2xs" className="my-0">저장 상태가 없는 계정은 제재할 수 없어요.</Note>}
      {!member && <Note size="2xs" className="my-0">게스트 계정은 비밀번호가 없어서 재설정 링크를 만들 수 없어요.</Note>}
      {notice && <Note className="my-0">{notice}</Note>}
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
