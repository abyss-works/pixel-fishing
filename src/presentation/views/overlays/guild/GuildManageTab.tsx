import { useState } from 'react';
import type { FormEvent } from 'react';
import { GUILD_JOIN_MODES, checkGuildName } from '../../../../game/rules/guild';
import type { GuildJoinMode } from '../../../../game/rules/guild';
import {
  GUILD_ERROR_TEXT, GUILD_JOIN_MODE_TEXT, GUILD_PITCH_LIMIT, GUILD_PITCH_PLACEHOLDER, GUILD_RENAME_COST_TEXT, GUILD_REQUEST_RULE,
  guildLinkUrl, inviteShareText, renameButtonState, requestRows,
} from '../../../../features/guild/model/guild';
import { josa } from '../../../../shared/lib/josa';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Subheading from '../../../ui/Subheading';
import TextInput from '../../../ui/TextInput';
import Tip from '../../../ui/Tip';
import type { GuildPartProps, GuildRun } from './guildProps';

// 관리 탭(길드장만): 위에서부터 가입 방식(세 칸 중 하나, 고른 칸은 눌린 모양), 고유 코드와 초대 링크(코드 복사, 링크 복사),
// 링크와 함께 복사하는 권유 문구, 길드 이름(이름 바꾸기 버튼이 작은 창을 연다), 가입 신청 표(행 끝에 거절과 승인)다. 신청 표는 남는 높이를 다 쓰고 그 안에서만 스크롤한다.
// 거절은 되돌릴 일이 적어 확인 창 없이 행 버튼으로 바로 보낸다.
export default function GuildManageTab({ guild, busy, run, setToast, gold, onGoldChanged }: Omit<GuildPartProps, 'me'> & {
  /** 내 골드 */
  gold: number;
  onGoldChanged: () => Promise<void> | void;
}) {
  const nowISO = useNow();
  const [renaming, setRenaming] = useState(false);
  const rename = renameButtonState(guild.renamedAt, nowISO, gold);
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
          <Tip wraps text="권유 문구와 링크를 함께 복사해요. 메신저에 붙이면 길드 미리보기가 떠요.">
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

      <section aria-label="길드 이름" className="flex flex-col gap-1.5 shrink-0">
        <Subheading className="mb-0 text-xs">길드 이름</Subheading>
        <Inset className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 h-11 px-3">
          <b className="truncate text-text">{guild.name}</b>
          {rename.reason === null ? (
            <Button size="sm" disabled={busy} onClick={() => setRenaming(true)}>이름 바꾸기</Button>
          ) : (
            <Tip wraps text={rename.reason}>
              <Button size="sm" disabled>이름 바꾸기</Button>
            </Tip>
          )}
        </Inset>
      </section>

      <section aria-label="가입 신청" className="flex flex-col gap-1.5 flex-1 min-h-0">
        <Subheading className="mb-0 text-xs">가입 신청</Subheading>
        <Inset className="pf-scroll-panel flex-1 min-h-0 overflow-y-auto px-3 pb-2">
          {guild.joinMode !== 'approval' && rows.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-text-dim">
              {guild.joinMode === 'open' ? '자유 가입이라 신청 없이 바로 들어와요.' : '닫혀 있어 새 신청을 받지 않아요.'}
            </p>
          ) : rows.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-text-dim">신청이 없어요.</p>
          ) : (
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup><col /><col className="w-32" /><col className="w-16" /><col className="w-36" /></colgroup>
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
            </table>
          )}
        </Inset>
      </section>
      {renaming && (
        <RenameDialog guildId={guild.id} current={guild.name} busy={busy} run={run} setToast={setToast}
                      onGoldChanged={onGoldChanged} onClose={() => setRenaming(false)} />
      )}
    </div>
  );
}

/** 이름 바꾸기 창: 새 이름 입력, 비용 한 줄, 확정 */
function RenameDialog({ guildId, current, busy, run, setToast, onGoldChanged, onClose }: {
  guildId: string; current: string; busy: boolean; run: GuildRun; setToast: GuildPartProps['setToast'];
  onGoldChanged: () => Promise<void> | void; onClose: () => void;
}) {
  const [name, setName] = useState('');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (!checkGuildName(next).ok) {
      setToast(GUILD_ERROR_TEXT['bad-name'], 'warn');
      return;
    }
    const error = await run({ op: 'rename', guildId, name: next });
    if (error) {
      setToast(error, 'warn');
      return;
    }
    onClose();
    setToast(`길드 이름을 ${next}${josa(next, '으로/로')} 바꿨어요.`);
    await onGoldChanged();
  };

  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title="길드 이름 바꾸기" onClose={onClose}>
        <form className="flex flex-col gap-3" onSubmit={e => { void onSubmit(e); }}>
          <TextInput value={name} maxLength={16} autoFocus onChange={e => setName(e.target.value)}
                     aria-label="새 길드 이름" placeholder={current} />
          <span className="text-2xs text-text-dim">{GUILD_RENAME_COST_TEXT}</span>
          <Button type="submit" variant="primary" full disabled={busy}>바꾸기</Button>
        </form>
      </ModalCard>
    </Modal>
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
