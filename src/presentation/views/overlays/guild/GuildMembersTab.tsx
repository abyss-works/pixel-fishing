import { useState } from 'react';
import {
  GUILD_ERROR_TEXT, GUILD_INVITE_RULE, inviteLeftText, leaveConfirm, memberActions, memberConfirm, memberRows, splitMembers,
} from '../../../../features/guild/model/guild';
import type { MemberRow } from '../../../../features/guild/model/guild';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import Tip from '../../../ui/Tip';
import type { GuildAsk, GuildPartProps } from './guildProps';

// 길드원 탭: 길드원 표(접속 점, 이름, 오늘 기여, 누적 기여, 기부)와 맨 아래 한 줄(초대 코드, 떠나기).
// 길드장에게는 다른 길드원 행 끝에 관리 버튼이 있고, 누르면 행 아래로 넘기기와 내보내기가 펼쳐진다.
// 관리 칸과 초대 코드 자리는 역할과 무관하게 같은 크기로 두어, 길드장이든 길드원이든 표와 줄의 크기가 같다.
export default function GuildMembersTab({ guild, me, busy, run, setToast, ask }: GuildPartProps & { ask: GuildAsk }) {
  /** 관리 메뉴를 펼친 길드원 */
  const [menu, setMenu] = useState<string | null>(null);
  const active = splitMembers(guild.members).active;
  const askAndClose: GuildAsk = c => { setMenu(null); ask(c); };
  const leave = () => {
    const c = leaveConfirm(guild, me);
    if (c) ask(c);
    else setToast(GUILD_ERROR_TEXT['handover-first'], 'warn');
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <Inset className="pf-scroll-panel flex-1 min-h-0 overflow-y-auto px-3 pb-2">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup><col /><col className="w-16" /><col className="w-20" /><col className="w-28" /><col className="w-8" /></colgroup>
          <thead>
            <tr className="sticky top-0 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
              <th className="h-8 text-left font-normal border-b border-line">이름</th>
              <th className="h-8 px-2 text-right font-normal border-b border-line">
                <Tip text="한국 시간 새벽 4시에 새로 세요.">오늘 기여</Tip>
              </th>
              <th className="h-8 px-2 text-right font-normal border-b border-line">누적 기여</th>
              <th className="h-8 px-2 text-right font-normal border-b border-line">기부</th>
              <th className="h-8 border-b border-line" aria-label="관리" />
            </tr>
          </thead>
          <tbody>
            {memberRows(guild, me).map((row, i) => {
              const target = active.find(m => m.uid === row.uid);
              const can = target ? memberActions(guild, me, target) : { kick: false, handover: false };
              const open = menu === row.uid;
              return (
                <MemberLine key={row.uid} row={row} first={i === 0} busy={busy} open={open}
                            onToggle={can.kick || can.handover ? () => setMenu(open ? null : row.uid) : null}
                            onHandover={can.handover && target ? () => askAndClose(memberConfirm(guild, target, 'handover')) : null}
                            onKick={can.kick && target ? () => askAndClose(memberConfirm(guild, target, 'kick')) : null} />
              );
            })}
          </tbody>
        </table>
      </Inset>
      <div className="h-8 shrink-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {guild.role === 'leader' && <InviteCode guild={guild} busy={busy} run={run} setToast={setToast} />}
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={leave}>길드 떠나기</Button>
      </div>
    </div>
  );
}

/** 길드원 한 행과, 펼쳤을 때 그 아래 관리 동작 행 */
function MemberLine({ row, first, busy, open, onToggle, onHandover, onKick }: {
  row: MemberRow; first: boolean; busy: boolean; open: boolean;
  /** 할 수 있는 관리 동작이 없으면 null이고, 그 칸은 비워 둔다 */
  onToggle: (() => void) | null;
  onHandover: (() => void) | null;
  onKick: (() => void) | null;
}) {
  const line = cx('h-9', !first && 'border-t border-line/60');
  return (
    <>
      <tr>
        <td className={line}>
          <span className="flex items-center gap-2 min-w-0">
            <span className={cx('size-2 shrink-0', row.online ? 'bg-accent' : 'bg-line')}
                  title={row.online ? '접속 중' : '접속 안 함'} aria-label={row.online ? '접속 중' : '접속 안 함'} />
            <b className={cx('truncate', row.me ? 'text-gold' : 'font-normal')}>{row.name}</b>
            {row.leader && <Badge>길드장</Badge>}
          </span>
        </td>
        <td className={cx(line, 'px-2 text-right pf-accent text-xs')}>{fmtNum(row.today)}</td>
        <td className={cx(line, 'px-2 text-right pf-accent text-xs')}>{fmtNum(row.total)}</td>
        <td className={cx(line, 'px-2 text-right pf-accent text-xs')}>{fmtNum(row.gave)}</td>
        <td className={cx(line, 'text-center')}>
          {onToggle && (
            <Frame as="button" type="button" aria-expanded={open} aria-label={`${row.name} 관리`} onClick={onToggle}
                   className={cx('inline-flex size-6 items-center justify-center gap-0.5 flex-col cursor-pointer bg-surface-2',
                     open && 'border-gold shadow-[inset_1px_1px_0_var(--bevel-hi),inset_-1px_-1px_0_var(--bevel-lo)]')}>
              <span className="size-[3px] bg-text-dim" /><span className="size-[3px] bg-text-dim" /><span className="size-[3px] bg-text-dim" />
            </Frame>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="h-11">
            <span className="flex justify-end gap-2 pr-8">
              {onHandover && <Button size="sm" disabled={busy} onClick={onHandover}>길드장 넘기기</Button>}
              {onKick && <Button size="sm" disabled={busy} onClick={onKick}>내보내기</Button>}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

/** 길드장의 초대 코드: 코드(툴팁에 규칙), 남은 시간, 복사, 새 코드 발급 */
function InviteCode({ guild, busy, run, setToast }: Omit<GuildPartProps, 'me'>) {
  const nowMs = Date.parse(useNow());
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
    <section className="flex items-center gap-2 min-w-0" aria-label="초대 코드">
      <span className="text-xs text-text-dim shrink-0">초대 코드</span>
      {guild.invite && (
        <>
          <Tip text={GUILD_INVITE_RULE} className="pf-accent tracking-widest text-gold">{guild.invite.code}</Tip>
          <span className="text-2xs text-text-dim shrink-0">{inviteLeftText(guild.invite.expiresAt, nowMs)}</span>
          <Button size="sm" onClick={() => { void copy(guild.invite?.code ?? ''); }}>복사</Button>
        </>
      )}
      <Button size="sm" disabled={busy} onClick={() => { void issue(); }}>{guild.invite ? '새 코드' : '코드 발급'}</Button>
    </section>
  );
}
