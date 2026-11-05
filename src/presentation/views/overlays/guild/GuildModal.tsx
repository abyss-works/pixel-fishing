import { useState } from 'react';
import type { FormEvent } from 'react';
import { GUILD_MAX_MEMBERS } from '../../../../game/rules/guild';
import { GUILD_ERROR_TEXT, inviteLeftText, leaveOutcome, memberActions, splitMembers } from '../../../../features/guild/model/guild';
import type { GuildInfo, GuildMemberItem, GuildOp } from '../../../../features/guild/model/guild';
import { useGuild } from '../../../../features/guild/service/useGuild';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import { cx } from '../../../ui/cx';
import type { Notify } from '../../../ui/hud/messageFeed';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import Panel from '../../../ui/Panel';
import TextInput from '../../../ui/TextInput';

// 길드 창 — 게임 스테이지 안에 뜬다.
// 길드가 없으면 왼쪽은 길드 만들기, 오른쪽은 초대 코드로 들어가기다.
// 길드가 있으면 왼쪽은 길드 정보와 초대 코드(길드장)·떠나기, 오른쪽은 길드원 목록(접속 여부, 길드장의 위임·내보내기)과 떠난 선원이다.
const nameOf = (m: GuildMemberItem) => m.nick ?? '이름 없음';
const FAILED = '요청을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.';

type Confirm = { title: string; label: string; text: string; op: GuildOp; done: string };

export default function GuildModal({ setToast, onClose }: { setToast: Notify; onClose: () => void }) {
  const { guild, loading, failed, you, act } = useGuild(true, true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  /** 요청 하나 — 거부는 안내 문장으로 돌려주고, 연결 실패는 알림으로 보인다 */
  const run = async (op: GuildOp): Promise<string | null> => {
    setBusy(true);
    try {
      const r = await act(op);
      return r.ok ? null : GUILD_ERROR_TEXT[r.error] ?? FAILED;
    } catch {
      return '길드 요청을 보내지 못했어요. 연결을 확인해 주세요.';
    } finally {
      setBusy(false);
    }
  };

  const body = guild && you
    ? <GuildView guild={guild} me={you} busy={busy} run={run} setToast={setToast} ask={setConfirm} />
    : guild === null && !loading && !failed
      ? <NoGuild busy={busy} run={run} setToast={setToast} />
      : (
        <div className="flex h-40 items-center justify-center">
          {failed ? <Note tone="warn">길드 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Note>
            : <Note>길드 정보를 불러오는 중이에요.</Note>}
        </div>
      );

  return (
    <Modal layer="stage" xl onClose={onClose}>
      <ModalCard title={guild ? `길드 · ${guild.name}` : '길드'} onClose={onClose}>{body}</ModalCard>
      {confirm && (
        <ConfirmDialog layer="stage" title={confirm.title} confirmLabel={confirm.label}
                       onCancel={() => setConfirm(null)}
                       onConfirm={() => {
                         const c = confirm;
                         setConfirm(null);
                         void run(c.op).then(error => setToast(error ?? c.done, error ? 'warn' : 'info'));
                       }}>
          <p className="text-sm">{confirm.text}</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}

type Run = (op: GuildOp) => Promise<string | null>;

/** 길드가 없을 때 — 만들기와 초대 코드로 들어가기 */
function NoGuild({ busy, run, setToast }: { busy: boolean; run: Run; setToast: Notify }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    const error = await run({ op: 'create', name: value });
    setNameError(error);
    if (!error) setToast(`${value} 길드를 만들었어요.`);
  };
  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    const error = await run({ op: 'join', code: code.trim() });
    setCodeError(error);
    if (!error) setToast('길드에 들어갔어요.');
  };

  return (
    <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
      <Panel title="길드 만들기" className="min-w-0">
        <form className="flex flex-col gap-1.5" onSubmit={e => { void onCreate(e); }}>
          <span className="text-xs text-text-dim">
            만든 사람이 길드장이 돼요. 이름은 닉네임과 같은 규칙(한글 1~8자, 영문 2~16자)이에요. 최대 {GUILD_MAX_MEMBERS}명까지 함께해요.
          </span>
          <div className="flex gap-2">
            <TextInput compact className="flex-1 min-w-0" value={name} maxLength={16}
                       onChange={e => setName(e.target.value)} aria-label="길드 이름" placeholder="길드 이름" />
            <Button type="submit" size="sm" variant="primary" disabled={busy}>만들기</Button>
          </div>
          {nameError && <Note tone="warn">{nameError}</Note>}
        </form>
      </Panel>
      <Panel title="초대 코드로 들어가기" className="min-w-0">
        <form className="flex flex-col gap-1.5" onSubmit={e => { void onJoin(e); }}>
          <span className="text-xs text-text-dim">길드장에게 받은 8자리 초대 코드를 입력해 주세요.</span>
          <div className="flex gap-2">
            <TextInput compact className="flex-1 min-w-0 uppercase" value={code} maxLength={16}
                       onChange={e => setCode(e.target.value)} aria-label="초대 코드" placeholder="초대 코드" />
            <Button type="submit" size="sm" variant="primary" disabled={busy}>들어가기</Button>
          </div>
          {codeError && <Note tone="warn">{codeError}</Note>}
        </form>
      </Panel>
    </div>
  );
}

/** 길드가 있을 때 — 길드 정보·초대 코드·떠나기와 길드원 목록 */
function GuildView({ guild, me, busy, run, setToast, ask }: {
  guild: GuildInfo; me: string; busy: boolean; run: Run; setToast: Notify; ask: (c: Confirm) => void;
}) {
  const nowMs = Date.parse(useNow());
  const { active, departed } = splitMembers(guild.members);
  const leader = guild.role === 'leader';
  const leave = leaveOutcome(guild, me);

  const issue = async () => {
    const error = await run({ op: 'invite', guildId: guild.id });
    setToast(error ?? '새 초대 코드를 발급했어요. 이전 코드는 더 쓸 수 없어요.', error ? 'warn' : 'info');
  };
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setToast('초대 코드를 복사했어요.');
    } catch {
      setToast('복사하지 못했어요. 코드를 직접 옮겨 적어 주세요.', 'warn');
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 max-[640px]:grid-cols-1">
      <Panel title="길드 정보" className="min-w-0">
        <div className="flex flex-col gap-3 text-sm">
          <p className="m-0">길드원 {active.length}/{GUILD_MAX_MEMBERS}명 · 나는 {leader ? '길드장' : '길드원'}이에요.</p>
          {leader && (
            <section className="flex flex-col gap-1.5" aria-label="초대 코드">
              <b className="text-xs">초대 코드</b>
              {guild.invite ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 font-mono tracking-widest text-gold">{guild.invite.code}</span>
                  <Button size="sm" onClick={() => { void copy(guild.invite?.code ?? ''); }}>복사</Button>
                </div>
              ) : <span className="text-xs text-text-dim">쓸 수 있는 코드가 없어요.</span>}
              <span className="text-xs text-text-dim">
                {guild.invite ? `${inviteLeftText(guild.invite.expiresAt, nowMs)} · ` : ''}
                코드는 24시간 동안 여러 사람이 쓸 수 있어요.
              </span>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => { void issue(); }}>
                {guild.invite ? '새 코드 발급' : '코드 발급'}
              </Button>
            </section>
          )}
          <section className="flex flex-col gap-1.5" aria-label="길드 떠나기">
            {leave === 'handover-first'
              ? <Note>다른 길드원이 있으면 길드장을 넘긴 뒤에 떠날 수 있어요.</Note>
              : (
                <Button size="sm" disabled={busy}
                        onClick={() => ask(leave === 'dissolve'
                          ? { title: '길드 해산', label: '해산', op: { op: 'remove', guildId: guild.id, uid: me },
                            text: `혼자 남은 길드라 떠나면 ${guild.name} 길드가 없어지고 길드 채팅도 지워져요. 떠날까요?`,
                            done: `${guild.name} 길드를 해산했어요.` }
                          : { title: '길드 떠나기', label: '떠나기', op: { op: 'remove', guildId: guild.id, uid: me },
                            text: `${guild.name} 길드를 떠날까요? 남긴 기록은 길드에 남고, 다시 들어오려면 초대 코드가 필요해요.`,
                            done: `${guild.name} 길드를 떠났어요.` })}>
                  길드 떠나기
                </Button>
              )}
          </section>
        </div>
      </Panel>
      <Panel title={`길드원 ${active.length}명`} className="min-w-0">
        <div className="pf-scroll-panel h-80 overflow-y-auto pr-1 flex flex-col gap-3 max-[640px]:h-56">
          <ul className="flex flex-col gap-1.5">
            {active.map(m => {
              const can = memberActions(guild, me, m);
              return (
                <li key={m.uid} className="flex items-center gap-2 text-sm">
                  <span className={cx('size-2 shrink-0', m.online ? 'bg-accent' : 'bg-line')} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <b className={cx('block truncate', m.uid === me && 'text-gold')}>{nameOf(m)}</b>
                    <span className={cx('block text-xs', m.online ? 'text-accent' : 'text-text-dim')}>
                      {m.online ? '접속 중' : '접속하지 않음'}
                    </span>
                  </span>
                  {m.role === 'leader' && <Badge>길드장</Badge>}
                  {can.handover && (
                    <Button size="sm" disabled={busy}
                            onClick={() => ask({ title: '길드장 넘기기', label: '넘기기',
                              op: { op: 'handover', guildId: guild.id, uid: m.uid },
                              text: `${nameOf(m)} 님에게 길드장을 넘길까요? 나는 길드원이 되고, 되돌리려면 새 길드장이 다시 넘겨야 해요.`,
                              done: `${nameOf(m)} 님에게 길드장을 넘겼어요.` })}>넘기기</Button>
                  )}
                  {can.kick && (
                    <Button size="sm" disabled={busy}
                            onClick={() => ask({ title: '길드원 내보내기', label: '내보내기',
                              op: { op: 'remove', guildId: guild.id, uid: m.uid },
                              text: `${nameOf(m)} 님을 길드에서 내보낼까요? 남긴 기록은 길드에 남아요.`,
                              done: `${nameOf(m)} 님을 내보냈어요.` })}>내보내기</Button>
                  )}
                </li>
              );
            })}
          </ul>
          {departed.length > 0 && (
            <section className="flex flex-col gap-1" aria-label="떠난 선원">
              <b className="text-xs">떠난 선원</b>
              {departed.map(m => <span key={m.uid} className="text-sm text-text-dim truncate">{nameOf(m)}</span>)}
            </section>
          )}
        </div>
      </Panel>
    </div>
  );
}
