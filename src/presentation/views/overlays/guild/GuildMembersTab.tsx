import { useState } from 'react';
import { memberActions, memberConfirm, memberName, splitMembers } from '../../../../features/guild/model/guild';
import type { GuildMemberItem } from '../../../../features/guild/model/guild';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';
import Subheading from '../../../ui/Subheading';
import type { GuildAsk, GuildPartProps } from './guildProps';

// 길드원 탭 — 지금 길드원 행(접속 여부·오늘/누적 기여·길드장 표시)과 떠난 선원.
// 넘기기·내보내기는 길드장에게만 보이는 관리 메뉴로 접고, 한 번에 한 행만 펼친다.
export default function GuildMembersTab({ guild, me, busy, ask }: Pick<GuildPartProps, 'guild' | 'me' | 'busy'> & { ask: GuildAsk }) {
  /** 관리 메뉴를 펼친 길드원 */
  const [menu, setMenu] = useState<string | null>(null);
  const { active, departed } = splitMembers(guild.members);
  const askAndClose: GuildAsk = c => { setMenu(null); ask(c); };

  return (
    <>
      <ul className="flex flex-col m-0 p-0 list-none divide-y divide-line">
        {active.map(m => {
          const can = memberActions(guild, me, m);
          return (
            <MemberRow key={m.uid} member={m} self={m.uid === me} busy={busy} open={menu === m.uid}
                       onToggle={can.handover || can.kick ? () => setMenu(menu === m.uid ? null : m.uid) : null}
                       onHandover={can.handover ? () => askAndClose(memberConfirm(guild, m, 'handover')) : null}
                       onKick={can.kick ? () => askAndClose(memberConfirm(guild, m, 'kick')) : null} />
          );
        })}
      </ul>
      {departed.length > 0 && (
        <section className="flex flex-col gap-0.5" aria-label="떠난 선원">
          <Subheading className="mb-0">떠난 선원</Subheading>
          {departed.map(m => (
            <span key={m.uid} className="flex items-center gap-2 text-xs text-text-dim">
              <span className="flex-1 min-w-0 truncate">{memberName(m)}</span>
              <span className="shrink-0">누적 {fmtNum(m.contribution.total)}</span>
            </span>
          ))}
        </section>
      )}
    </>
  );
}

/** 길드원 한 행 — 접속 점, 이름(나는 금색), 접속 여부, 오늘·누적 기여, 길드장 표시, 관리 메뉴(동작이 있을 때만) */
function MemberRow({ member: m, self, busy, open, onToggle, onHandover, onKick }: {
  member: GuildMemberItem; self: boolean; busy: boolean; open: boolean;
  /** 관리 메뉴 펼치기 — 할 수 있는 동작이 없으면 null이고 메뉴 버튼이 없다 */
  onToggle: (() => void) | null;
  onHandover: (() => void) | null;
  onKick: (() => void) | null;
}) {
  const name = memberName(m);
  return (
    <li className="flex flex-col gap-1 py-1 text-sm">
      <div className="flex items-center gap-2">
        <span className={cx('size-2 shrink-0', m.online ? 'bg-accent' : 'bg-line')} aria-hidden="true" />
        <span className="flex-1 min-w-0 truncate">
          <b className={cx(self && 'text-gold')}>{name}</b>
          {' '}<span className={cx('text-xs', m.online ? 'text-accent' : 'text-text-dim')}>
            {m.online ? '접속 중' : '접속하지 않음'}
          </span>
        </span>
        <span className="shrink-0 text-xs text-text-dim">
          오늘 <b className="text-text">{fmtNum(m.contribution.today)}</b>
          {' · '}누적 <b className="text-text">{fmtNum(m.contribution.total)}</b>
        </span>
        {m.role === 'leader' && <Badge>길드장</Badge>}
        {onToggle && (
          <Button size="sm" variant="ghost" aria-expanded={open} aria-label={`${name} 관리`} onClick={onToggle}>관리</Button>
        )}
      </div>
      {open && (
        <div className="flex justify-end gap-1">
          {onHandover && <Button size="sm" disabled={busy} onClick={onHandover}>넘기기</Button>}
          {onKick && <Button size="sm" disabled={busy} onClick={onKick}>내보내기</Button>}
        </div>
      )}
    </li>
  );
}
