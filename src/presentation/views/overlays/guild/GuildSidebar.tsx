import { GUILD_MAX_MEMBERS } from '../../../../game/rules/guild';
import {
  GUILD_CONTRIBUTION_HELP, activeEffectLines, growthBar, growthHintText, growthTotalText, inviteHintText, leaveConfirm, splitMembers,
} from '../../../../features/guild/model/guild';
import type { GuildInfo } from '../../../../features/guild/model/guild';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import HelpHint from '../../../ui/HelpHint';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import type { GuildAsk, GuildPartProps } from './guildProps';

// 길드 정보 열 — 레벨과 진행 막대, 인원과 내 역할, 초대 코드(길드장), 받는 보너스, 떠나기.
// 탭과 따로 놓여 탭을 바꿔도 그대로 보인다. 넘치면 이 열 안에서만 굴린다.
export default function GuildSidebar({ guild, me, busy, run, setToast, ask }: GuildPartProps & { ask: GuildAsk }) {
  const leader = guild.role === 'leader';
  const lines = activeEffectLines(guild.bonuses);
  const leave = leaveConfirm(guild, me);

  return (
    <section className="pf-scroll-panel flex flex-col gap-2 min-h-0 overflow-y-auto text-sm" aria-label="길드 정보">
      <GrowthSummary growth={guild.growth} />
      <Inset className="px-2 py-1.5 flex flex-col gap-1.5">
        <p className="m-0">길드원 <b>{splitMembers(guild.members).active.length}</b>/{GUILD_MAX_MEMBERS}명 · {leader ? '길드장' : '길드원'}</p>
        {leader && <InviteCode guild={guild} busy={busy} run={run} setToast={setToast} />}
      </Inset>
      <Inset className="px-2 py-1.5 flex flex-col gap-0.5">
        <span className="text-xs text-text-dim">받는 보너스</span>
        {lines.length > 0
          ? <span className="text-accent">{lines.join(' · ')}</span>
          : <span className="text-xs text-text-dim">받는 보너스가 없어요.</span>}
      </Inset>
      <section className="mt-auto flex flex-col" aria-label="길드 떠나기">
        {leave === null
          ? <Note size="xs" className="my-0">다른 길드원이 있으면 길드장을 넘긴 뒤에 떠날 수 있어요.</Note>
          : <Button size="sm" variant="ghost" disabled={busy} onClick={() => ask(leave)}>길드 떠나기</Button>}
      </section>
    </section>
  );
}

/** 길드 레벨 요약 — 레벨, 누적 기여 / 다음 레벨 문턱, 진행 막대, 다음 레벨까지 남은 기여와 기여 도움말 */
function GrowthSummary({ growth }: { growth: GuildInfo['growth'] }) {
  const bar = growthBar(growth);
  return (
    <Inset className="px-2 py-1.5">
      <section className="flex flex-col gap-1" aria-label="길드 레벨">
        <div className="flex items-baseline gap-2">
          <span className="pf-accent text-lg text-gold">Lv.{growth.level}</span>
          <span className="text-xs text-text-dim">
            {growthTotalText(growth)}
          </span>
        </div>
        <span className="block h-2 border border-line bg-surface-2" role="meter" aria-label="다음 레벨까지 진행"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar.ratio * 100)}>
          <span className={cx('block h-full', bar.remaining === null ? 'bg-gold' : 'bg-accent')}
                style={{ width: `${bar.ratio * 100}%` }} />
        </span>
        <span className="text-xs text-text-dim">
          <span>{growthHintText(growth)}</span><HelpHint text={GUILD_CONTRIBUTION_HELP} />
        </span>
      </section>
    </Inset>
  );
}

/** 길드장의 초대 코드 — 코드와 복사, 남은 시간, 새 코드 발급 */
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
    <section className="flex flex-col gap-1" aria-label="초대 코드">
      <span className="text-xs text-text-dim">초대 코드</span>
      {guild.invite ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 font-mono tracking-widest text-gold">{guild.invite.code}</span>
          <Button size="sm" onClick={() => { void copy(guild.invite?.code ?? ''); }}>복사</Button>
        </div>
      ) : <span className="text-xs text-text-dim">쓸 수 있는 코드가 없어요.</span>}
      <span className="text-xs text-text-dim">{inviteHintText(guild.invite, nowMs)}</span>
      <Button size="sm" disabled={busy} onClick={() => { void issue(); }}>
        {guild.invite ? '새 코드 발급' : '코드 발급'}
      </Button>
    </section>
  );
}
