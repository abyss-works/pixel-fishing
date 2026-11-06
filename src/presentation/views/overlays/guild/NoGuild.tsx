import { useState } from 'react';
import type { FormEvent } from 'react';
import { GUILD_MAX_MEMBERS, joinRequestDaysLeft, normalizeGuildCode } from '../../../../game/rules/guild';
import { inviteDialogView } from '../../../../features/guild/model/guild';
import type { GuildMyRequest } from '../../../../features/guild/model/guild';
import { useGuildInvite } from '../../../../features/guild/service/useGuildInvite';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Button from '../../../ui/Button';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import Subheading from '../../../ui/Subheading';
import TextInput from '../../../ui/TextInput';
import Tip from '../../../ui/Tip';
import GuildInviteSummary from './GuildInviteSummary';
import type { GuildRun } from './guildProps';

/** 코드로 들어오기 — 바로 들어갔는지 신청이 됐는지, 거부면 안내 문장 */
export type GuildJoin = (code: string) => Promise<{ error: string | null; requested: boolean }>;

// 길드가 없을 때 — 400 폭 한 열. 위는 길드 고유 코드(8자리)로 찾기와 찾은 길드의 요약, 가입 방식에 따른 확정 버튼(들어가기,
// 가입 신청, 받지 않음)이고, 아래는 길드 만들기다. 넣어 둔 가입 신청이 있으면 맨 위에 그 길드와 남은 기간, 신청 취소를 둔다.
// 새 길드를 찾아 신청하면 이전 신청은 그 신청으로 바뀌고, 길드를 만들면 신청은 사라진다.
export default function NoGuild({ busy, run, join, request, setToast }: {
  busy: boolean;
  run: GuildRun;
  join: GuildJoin;
  /** 넣어 둔 가입 신청 */
  request: GuildMyRequest | null;
  setToast: Notify;
}) {
  const nowISO = useNow();
  const [name, setName] = useState('');
  const [input, setInput] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const invite = useGuildInvite(code);
  const view = code && invite.settled ? inviteDialogView(invite.preview, { account: true, guild: null }) : null;

  const onFind = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeGuildCode(input);
    setCodeError(c ? null : '길드 코드는 8자리예요.');
    setCode(c);
  };
  const onJoin = async () => {
    if (!code) return;
    const r = await join(code);
    setCodeError(r.error);
    if (!r.error) setToast(r.requested ? '가입 신청을 보냈어요. 길드장이 승인하면 들어가요.' : '길드에 들어갔어요.');
  };
  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    const error = await run({ op: 'create', name: value });
    setNameError(error);
    if (!error) setToast(`${value} 길드를 만들었어요.`);
  };
  const onCancel = async () => {
    const error = await run({ op: 'cancelRequest' });
    setToast(error ?? '가입 신청을 거뒀어요.', error ? 'warn' : 'info');
  };

  return (
    <div className="flex flex-col gap-3">
      {request && (
        <Inset className="flex items-center gap-2 h-11 px-3 text-sm">
          <span className="flex-1 min-w-0 truncate"><b>{request.name}</b> 길드에 가입을 신청했어요.</span>
          <span className="pf-accent text-2xs text-text-dim">{joinRequestDaysLeft(request.requestedAt, nowISO)}일 남음</span>
          <Button size="sm" disabled={busy} onClick={() => { void onCancel(); }}>신청 취소</Button>
        </Inset>
      )}

      <form className="flex flex-col gap-1.5" onSubmit={onFind}>
        <Subheading className="mb-0 text-xs">코드로 들어가기</Subheading>
        <div className="flex gap-2">
          <TextInput compact className="flex-1 min-w-0 uppercase pf-accent tracking-widest" value={input} maxLength={16}
                     onChange={e => setInput(e.target.value)} aria-label="길드 코드" placeholder="길드 코드" />
          <Button type="submit" size="sm" disabled={busy}>찾기</Button>
        </div>
      </form>
      <GuildInviteSummary preview={invite.preview} view={view} busy={busy} onConfirm={() => { void onJoin(); }} />
      {codeError && <Note tone="warn">{codeError}</Note>}

      <form className="flex flex-col gap-1.5 pt-3 border-t border-line" onSubmit={e => { void onCreate(e); }}>
        <Subheading className="mb-0 text-xs">
          <Tip text={`만든 사람이 길드장이 돼요.\n이름은 닉네임과 같은 규칙(한글 1~8자, 영문 2~16자)이에요.\n최대 ${GUILD_MAX_MEMBERS}명까지 함께해요.`}>
            길드 만들기
          </Tip>
        </Subheading>
        <div className="flex gap-2">
          <TextInput compact className="flex-1 min-w-0" value={name} maxLength={16}
                     onChange={e => setName(e.target.value)} aria-label="길드 이름" placeholder="길드 이름" />
          <Button type="submit" size="sm" variant="primary" disabled={busy}>만들기</Button>
        </div>
        {nameError && <Note tone="warn">{nameError}</Note>}
      </form>
    </div>
  );
}
