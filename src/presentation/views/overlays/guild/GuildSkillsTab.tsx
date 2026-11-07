import { useState } from 'react';
import type { FormEvent } from 'react';
import { applyDonation } from '../../../../game/rules/guild';
import type { GuildBonusId } from '../../../../game/rules/guild';
import { DONATION_STEPS, GUILD_BONUS_TIP, GUILD_ERROR_TEXT, bonusRows } from '../../../../features/guild/model/guild';
import type { BonusNode, BonusRow } from '../../../../features/guild/model/guild';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';
import Frame from '../../../ui/Frame';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';
import TextInput from '../../../ui/TextInput';
import Tip from '../../../ui/Tip';
import type { GuildPartProps, GuildRun } from './guildProps';
import { SCROLL_Y } from '../../../ui/scrollArea';

// 길드 스킬 탭: 오목한 판 위의 스킬 트리, 그 아래 고른 스킬의 두 칸(효과, 모인 골드와 기부 버튼).
// 스킬 다섯이 가로로 놓이고 단계 1~5가 위에서 아래로 뻗는다. 이룬 단계는 금색으로 차고, 다음 단계는 모인 비율만큼 찬다.
// 상한(길드 레벨) 위 단계와 열리지 않은 스킬은 흐리게 그린다. 스킬 머리를 누르면 그 스킬이 골라지고 눌린 모양이 된다.
// 기부는 기부 버튼으로 여는 작은 창에서 한다. 기부 뒤에는 길드 정보와 게임 상태(골드)를 다시 읽는다.
export default function GuildSkillsTab({ guild, busy, run, setToast, onGoldChanged }: GuildPartProps & {
  onGoldChanged: () => Promise<void> | void;
}) {
  const rows = bonusRows(guild.bonuses);
  const [picked, setPicked] = useState<GuildBonusId>(
    () => (rows.find(r => r.canDonate) ?? rows.find(r => !r.locked) ?? rows[0])?.id ?? 'sell');
  const [donating, setDonating] = useState(false);
  const sel = rows.find(r => r.id === picked) ?? rows[0];

  return (
    <div className={`flex flex-col gap-3 flex-1 min-h-0 ${SCROLL_Y}`}>
      <Inset className="shrink-0 px-3 py-4">
        <div className="grid grid-cols-5 gap-3" role="group" aria-label="길드 스킬 트리">
          {rows.map(row => <Branch key={row.id} row={row} active={row.id === picked} onPick={() => setPicked(row.id)} />)}
        </div>
      </Inset>
      {sel && (
        <div className="grid grid-cols-2 gap-3 shrink-0 mobile:grid-cols-1">
          <Inset className="p-3 flex flex-col gap-2">
            <section aria-label={`${sel.name} 효과`} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 pb-1">
                <Tip text={GUILD_BONUS_TIP[sel.id]} className="font-bold text-gold">{sel.name}</Tip>
                <span className="pf-accent text-xs text-text-dim">{sel.rank}/{sel.cap}</span>
              </div>
              <ValueRow label={`현재(${sel.rank}단계)`} value={sel.now ?? '-'} />
              <ValueRow label={`다음(${sel.rank + 1}단계)`} value={sel.rank >= 5 ? '-' : sel.after ?? '-'} up />
            </section>
          </Inset>
          <Inset className="p-3 flex flex-col gap-2">
            <ValueRow label="모인 골드" value={sel.next === null ? '-' : `${fmtNum(sel.pool)} / ${fmtNum(sel.next)}`} />
            <span className="block h-2 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]" role="meter"
                  aria-label={`${sel.name} 다음 단계까지`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sel.ratio * 100)}>
              <span className="block h-full bg-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" style={{ width: `${sel.ratio * 100}%` }} />
            </span>
            {sel.canDonate ? (
              <Button variant="primary" full disabled={busy} onClick={() => setDonating(true)} className="mt-auto">기부</Button>
            ) : (
              <Tip wraps text={GUILD_ERROR_TEXT[sel.locked ? 'bonus-locked' : 'rank-maxed']} className="mt-auto block">
                <Button variant="primary" full disabled className="pointer-events-none">기부</Button>
              </Tip>
            )}
          </Inset>
        </div>
      )}
      {donating && sel && (
        <DonateDialog row={sel} guildId={guild.id} busy={busy} run={run} setToast={setToast}
                      onGoldChanged={onGoldChanged} onClose={() => setDonating(false)} />
      )}
    </div>
  );
}

/** 이름은 왼쪽, 값은 오른쪽인 한 줄 */
function ValueRow({ label, value, up }: { label: string; value: string; up?: boolean }) {
  return (
    <span className="flex items-center justify-between gap-3 h-7 border-t border-line/60 first:border-t-0">
      <span className="text-sm text-text-dim">{label}</span>
      <span className={cx('pf-accent text-xs', up && 'text-accent')}>{value}</span>
    </span>
  );
}

/** 스킬 머리의 픽셀 아이콘 */
const GLYPH: Record<GuildBonusId, GlyphId> = { sell: 'coin', bag: 'fish', named: 'star', rare: 'rod', mutation: 'plus' };

/** 스킬 한 열: 볼록한 머리(아이콘, 이름)와 단계 노드 다섯. 단계는 노드가 보이므로 머리에 따로 쓰지 않는다 */
function Branch({ row, active, onPick }: { row: BonusRow; active: boolean; onPick: () => void }) {
  return (
    <div className={cx('flex flex-col items-center min-w-0', row.locked && 'opacity-45')}>
      <Tip wraps pressOpens text={row.locked ? `길드 Lv.${row.unlock}에 열려요.` : GUILD_BONUS_TIP[row.id]} className="block w-full">
      <Frame as="button" type="button" onClick={row.locked ? undefined : onPick} aria-disabled={row.locked || undefined}
             aria-pressed={active} aria-label={`${row.name} 고르기`}
             className={cx('w-full h-14 px-1 flex flex-col items-center justify-center gap-1 text-xs',
               row.locked ? 'cursor-default' : 'cursor-pointer',
               active
                 ? 'border-gold text-gold bg-[color-mix(in_oklab,var(--c-surface-2)_70%,var(--c-bg))] translate-y-px shadow-[inset_2px_2px_0_var(--bevel-hi),inset_-2px_-2px_0_var(--bevel-lo)]'
                 : 'text-text bg-surface-2 hover:border-accent')}>
        <PixelIcon glyph={GLYPH[row.id]} size={16} />
        <span className="text-center leading-tight">{row.name}</span>
      </Frame>
      </Tip>
      {row.nodes.map((node, i) => (
        <div key={node.rank} className={cx('flex flex-col items-center', i === 0 && 'mt-2.5')}>
          {i > 0 && <span className={cx('block w-0.5 h-1.5', node.state === 'done' ? 'bg-gold' : 'bg-line')} aria-hidden="true" />}
          <Node node={node} label={`${row.name} ${node.rank}단계`} />
        </div>
      ))}
    </div>
  );
}

const NODE_TEXT: Record<BonusNode['state'], string> = { done: '이룸', next: '모으는 중', open: '열림', capped: '상한 위' };

/** 단계 노드: 이룬 단계는 금색으로 볼록하게 차고, 다음 단계는 모인 비율만큼 위에서 아래로 찬다. 상한 위는 오목하고 흐리다 */
function Node({ node, label }: { node: BonusNode; label: string }) {
  return (
    <span role="img" aria-label={`${label} ${NODE_TEXT[node.state]}`}
          className={cx('relative size-7 overflow-hidden flex items-center justify-center pf-accent text-xs border-2',
            '[clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]',
            node.state === 'done' && 'border-gold-dark bg-gold text-[#08111f] shadow-[inset_1px_1px_0_rgba(255,255,255,0.5),inset_-1px_-1px_0_rgba(0,0,0,0.25)]',
            node.state === 'next' && 'border-gold bg-surface-2 text-text shadow-[inset_1px_1px_0_var(--bevel-lo),inset_-1px_-1px_0_var(--bevel-hi)]',
            node.state === 'open' && 'border-line bg-surface-2 text-text-dim shadow-[inset_1px_1px_0_var(--bevel-lo),inset_-1px_-1px_0_var(--bevel-hi)]',
            node.state === 'capped' && 'border-line bg-transparent text-text-dim opacity-50 shadow-[inset_1px_1px_0_var(--bevel-hi)]')}>
      {node.state === 'next' && (
        <span className="absolute inset-x-0 top-0 bg-gold/45" style={{ height: `${node.fill * 100}%` }} aria-hidden="true" />
      )}
      <span className="relative">{node.rank}</span>
    </span>
  );
}

/** 기부 창: 빠른 금액과 입력, 되돌릴 수 없다는 한 줄, 확정 */
function DonateDialog({ row, guildId, busy, run, setToast, onGoldChanged, onClose }: {
  row: BonusRow; guildId: string; busy: boolean; run: GuildRun; setToast: Notify;
  onGoldChanged: () => Promise<void> | void; onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const add = (step: number) => setAmount(String((Number(amount) || 0) + step));
  const onDonate = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount || row.need);
    if (!Number.isSafeInteger(value) || value <= 0) {
      setToast(GUILD_ERROR_TEXT['bad-amount'], 'warn');
      return;
    }
    // 상한까지 필요한 골드만 받는다. 서버와 같은 규칙으로 실제로 받을 골드를 미리 계산해 알린다
    const accepted = applyDonation(row.pool, row.rank, row.cap, value).accepted;
    const error = await run({ op: 'donate', guildId, bonus: row.id, amount: value });
    if (error) {
      setToast(error, 'warn');
      return;
    }
    onClose();
    setToast(`${row.name}에 ${fmtNum(accepted)}G를 기부했어요.`);
    await onGoldChanged();
  };

  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title={`${row.name} 기부`} onClose={onClose}>
        <form className="flex flex-col gap-3" onSubmit={e => { void onDonate(e); }}>
          <Inset className="p-3 flex flex-col gap-2">
            <div className="flex gap-2">
              {DONATION_STEPS.map(step => (
                <Button key={step} type="button" size="sm" disabled={busy} onClick={() => add(step)}>+{step / 10_000}만</Button>
              ))}
              <Button type="button" size="sm" disabled={busy || row.need === null} onClick={() => setAmount(String(row.need ?? ''))}>남은 만큼</Button>
            </div>
            <TextInput type="number" inputMode="numeric" min={1} step={1} value={amount}
                       placeholder={row.need === null ? '' : fmtNum(row.need)}
                       onChange={e => setAmount(e.target.value)} aria-label={`${row.name} 기부 골드`} />
          </Inset>
          <span className="text-2xs text-text-dim">기부한 골드는 돌려받지 않아요.</span>
          <Button type="submit" variant="primary" full disabled={busy}>기부</Button>
        </form>
      </ModalCard>
    </Modal>
  );
}
