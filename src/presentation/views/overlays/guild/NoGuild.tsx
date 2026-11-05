import { useState } from 'react';
import type { FormEvent } from 'react';
import { GUILD_MAX_MEMBERS } from '../../../../game/rules/guild';
import Button from '../../../ui/Button';
import type { Notify } from '../../../ui/hud/messageFeed';
import Note from '../../../ui/Note';
import Panel from '../../../ui/Panel';
import TextInput from '../../../ui/TextInput';
import type { GuildRun } from './guildProps';

// 길드가 없을 때 — 좌우 두 칸, 길드 만들기와 초대 코드로 들어가기. 거부되면 그 칸 아래에 이유를 보인다.
export default function NoGuild({ busy, run, setToast }: { busy: boolean; run: GuildRun; setToast: Notify }) {
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
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 max-[640px]:grid-cols-1">
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
