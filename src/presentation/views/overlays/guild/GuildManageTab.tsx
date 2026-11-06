import { useState } from 'react';
import { GUILD_JOIN_MODES } from '../../../../game/rules/guild';
import type { GuildJoinMode } from '../../../../game/rules/guild';
import {
  GUILD_JOIN_MODE_TEXT, GUILD_PITCH_LIMIT, GUILD_PITCH_PLACEHOLDER, GUILD_REQUEST_RULE, guildLinkUrl, inviteShareText, requestRows,
} from '../../../../features/guild/model/guild';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import Subheading from '../../../ui/Subheading';
import TextInput from '../../../ui/TextInput';
import Tip from '../../../ui/Tip';
import type { GuildPartProps } from './guildProps';

// 관리 탭(길드장만): 위에서부터 가입 방식(세 칸 중 하나, 고른 칸은 눌린 모양), 고유 코드와 초대 링크(코드 복사, 링크 복사),
// 링크와 함께 복사하는 권유 문구, 가입 신청 표(행 끝에 거절과 승인)다. 신청 표는 남는 높이를 다 쓰고 그 안에서만 스크롤한다.
// 거절은 되돌릴 일이 적어 확인 창 없이 행 버튼으로 바로 보낸다.
export default function GuildManageTab({ guild, busy, run, setToast }: Omit<GuildPartProps, 'me'>) {
  const nowISO = useNow();
  const url = guildLinkUrl(window.location.origin, guild.code);
  const [pitch, setPitch] = useState(guild.pitch ?? '');

  const send = async (op: Parameters<GuildPartProps['run']>[0], done: string) => {
    const error = await run(op);
    setToast(error ?? done, error ? 'warn' : 'info');
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${what}을 복사했어요.`);
    } catch {
      setToast('복사하지 못했어요. 직접 옮겨 적어 주세요.', 'warn');
    }
  };
  const savePitch = () => {
    const next = pitch.trim() === '' ? null : pitch.trim();
    if (next === guild.pitch) return;
    void send({ op: 'settings', guildId: guild.id, pitch: next }, next === null ? '기본 권유 문구를 써요.' : '권유 문구를 바꿨어요.');
  };
  const rows = requestRows(guild.requests, nowISO);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <section aria-label="가입 방식" className="flex flex-col gap-1.5 shrink-0">
        <Subheading className="mb-0 text-xs">가입 방식</Subheading>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="가입 방식">
          {GUILD_JOIN_MODES.map(mode => (
            <ModeCell key={mode} mode={mode} on={guild.joinMode === mode} disabled={busy}
                      onSelect={() => {
                        if (guild.joinMode !== mode) {
                          void send({ op: 'settings', guildId: guild.id, joinMode: mode }, `가입 방식을 ${GUILD_JOIN_MODE_TEXT[mode].name}으로 바꿨어요.`);
                        }
                      }} />
          ))}
        </div>
      </section>

      <section aria-label="고유 코드와 링크" className="flex flex-col gap-1.5 shrink-0">
        <Subheading className="mb-0 text-xs">고유 코드와 링크</Subheading>
        <Inset className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 h-11 px-3">
          <span className="pf-accent tracking-widest text-gold">{guild.code}</span>
          <span className="truncate text-xs text-text-dim">{url.replace(/^https?:\/\//, '')}</span>
          <Button size="sm" onClick={() => { void copy(guild.code, '길드 코드'); }}>코드 복사</Button>
          <Tip wraps text={'권유 문구와 링크를 함께 복사해요.\n메신저에 붙이면 길드 미리보기가 떠요.'}>
            <Button size="sm" onClick={() => { void copy(inviteShareText(guild.pitch, url), '초대 링크'); }}>링크 복사</Button>
          </Tip>
        </Inset>
        <div className="flex items-center gap-2">
          <TextInput compact className="flex-1 min-w-0" value={pitch} maxLength={GUILD_PITCH_LIMIT}
                     onChange={e => setPitch(e.target.value)} onBlur={savePitch}
                     onKeyDown={e => { if (e.key === 'Enter') savePitch(); }}
                     aria-label="권유 문구" placeholder={GUILD_PITCH_PLACEHOLDER} />
          <span className="pf-accent w-12 text-right text-2xs text-text-dim">{[...pitch].length}/{GUILD_PITCH_LIMIT}</span>
        </div>
      </section>

      <section aria-label="가입 신청" className="flex flex-col gap-1.5 flex-1 min-h-0">
        <Subheading className="mb-0 text-xs">가입 신청</Subheading>
        <TableBox className="flex-1 min-h-0 px-3 pb-2">
          {guild.joinMode !== 'approval' && rows.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-text-dim">
              {guild.joinMode === 'open' ? '자유 가입이라 신청 없이 바로 들어와요.' : '닫혀 있어 새 신청을 받지 않아요.'}
            </p>
          ) : rows.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-text-dim">신청이 없어요.</p>
          ) : (
            <DataTable cols={[null, '8rem', '4rem', '9rem']} nameMin="8rem">
              <thead>
                <tr className="text-2xs text-text-dim">
                  <th className="h-8 text-left font-normal border-b border-line">신청한 사람</th>
                  <th className="h-8 px-2 text-left font-normal border-b border-line">신청 시각</th>
                  <th className="h-8 px-2 text-right font-normal border-b border-line"><Tip text={GUILD_REQUEST_RULE}>남은 기간</Tip></th>
                  <th className="h-8 border-b border-line" aria-label="처리" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.uid} className="border-b border-line/60">
                    <td className="h-10 truncate font-bold">{r.name}</td>
                    <td className="h-10 px-2 text-xs text-text-dim">{r.when}</td>
                    <td className="h-10 px-2 pf-accent text-right text-xs">{r.daysLeft}일</td>
                    <td className="h-10">
                      <span className="flex justify-end gap-2">
                        <Button size="sm" disabled={busy}
                                onClick={() => { void send({ op: 'reject', guildId: guild.id, uid: r.uid }, `${r.name} 님의 신청을 거절했어요.`); }}>
                          거절
                        </Button>
                        <Button size="sm" variant="primary" disabled={busy}
                                onClick={() => { void send({ op: 'approve', guildId: guild.id, uid: r.uid }, `${r.name} 님이 길드에 들어왔어요.`); }}>
                          승인
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </TableBox>
      </section>
    </div>
  );
}

/** 가입 방식 한 칸 — 이름과 한 줄 설명. 고른 칸은 눌린 모양(오목한 베벨)과 골드 테두리다 */
function ModeCell({ mode, on, disabled, onSelect }: { mode: GuildJoinMode; on: boolean; disabled: boolean; onSelect: () => void }) {
  const t = GUILD_JOIN_MODE_TEXT[mode];
  return (
    <Frame as="button" type="button" role="radio" aria-checked={on} disabled={disabled} onClick={onSelect}
           className={cx('flex flex-col items-start gap-1 px-3 py-2 text-left cursor-pointer',
             on ? 'outline outline-1 outline-gold bg-surface-2 shadow-[inset_2px_2px_0_var(--bevel-lo),inset_-2px_-2px_0_var(--bevel-hi)]'
               : 'hover:bg-surface-2')}>
      <b className={cx('text-sm', on ? 'text-gold' : 'text-text')}>{t.name}</b>
      <span className="text-2xs text-text-dim">{t.desc}</span>
    </Frame>
  );
}
