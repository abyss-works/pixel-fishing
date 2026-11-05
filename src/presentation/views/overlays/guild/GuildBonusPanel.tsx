import { useState } from 'react';
import type { FormEvent } from 'react';
import { applyDonation } from '../../../../game/rules/guild';
import type { GuildBonusId } from '../../../../game/rules/guild';
import { DONATION_STEPS, GUILD_ERROR_TEXT, bonusRows, donorRanking } from '../../../../features/guild/model/guild';
import type { BonusNode, BonusRow, GuildInfo, GuildOp } from '../../../../features/guild/model/guild';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { fmtNum } from '../../../ui/format';
import Frame from '../../../ui/Frame';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';
import RankList from '../../../ui/RankList';
import Subheading from '../../../ui/Subheading';
import TextInput from '../../../ui/TextInput';

// 길드 보너스 탭 — 스킬 트리. 보너스 다섯이 가로로 놓이고, 각 보너스의 단계 1~5가 위에서 아래로 뻗는다.
// 이룬 단계는 금색으로 빛나고 그 사이 연결선도 금색이다. 다음 단계 노드는 모인 골드 비율만큼 위에서 아래로 찬다.
// 상한(길드 레벨) 위 노드와 열리지 않은 보너스는 흐리게 그린다. 보너스 머리나 노드를 고르면 아래 상세에서 기부한다.
// 맨 아래는 보너스를 합친 사람별 전체 기부 순위다. 값은 서버 응답을 그대로 보이고, 기부 뒤에는 길드 정보와
// 게임 상태(골드)를 다시 읽는다.
type Run = (op: GuildOp) => Promise<string | null>;

/** 열 머리의 짧은 이름과 아이콘 — 다섯 열이 한 줄에 들어가도록 줄인다 */
const HEAD: Record<GuildBonusId, { label: string; glyph: GlyphId }> = {
  sell: { label: '판매가', glyph: 'coin' },
  bag: { label: '가방', glyph: 'fish' },
  named: { label: '네임드', glyph: 'star' },
  rare: { label: '희귀', glyph: 'rod' },
  mutation: { label: '돌연변이', glyph: 'plus' },
};

export default function GuildBonusPanel({ guild, me, busy, run, setToast, onGoldChanged }: {
  guild: GuildInfo; me: string; busy: boolean; run: Run; setToast: Notify; onGoldChanged: () => Promise<void> | void;
}) {
  const rows = bonusRows(guild.bonuses);
  const [picked, setPicked] = useState<GuildBonusId>(() => rows.find(r => r.canDonate)?.id ?? rows[0]?.id ?? 'sell');
  const selected = rows.find(r => r.id === picked) ?? rows[0];
  const myTotal = guild.donors.find(d => d.uid === me)?.gold ?? 0;
  const ranking = donorRanking(guild.donors, me);
  const mine = ranking.find(r => r.me);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-1" role="group" aria-label="보너스 스킬 트리">
        {rows.map(row => <Branch key={row.id} row={row} active={row.id === picked} onPick={() => setPicked(row.id)} />)}
      </div>
      {selected && (
        <Detail key={selected.id} row={selected} myTotal={myTotal} guildId={guild.id} busy={busy} run={run}
                setToast={setToast} onGoldChanged={onGoldChanged} />
      )}
      <section className="flex flex-col gap-1" aria-label="기부 순위">
        <Subheading className="mb-0">기부 순위</Subheading>
        {ranking.length > 0
          ? <RankList rows={ranking.slice(0, 10)} me={mine ? { rank: mine.rank, value: mine.value } : null} valueLabel="기부"
                      format={v => `${fmtNum(v)}골드`} />
          : <Note size="xs" className="my-0">아직 기부한 길드원이 없어요.</Note>}
      </section>
    </div>
  );
}

/** 보너스 한 열 — 머리와 단계 노드 다섯 */
function Branch({ row, active, onPick }: { row: BonusRow; active: boolean; onPick: () => void }) {
  return (
    <div className={cx('flex flex-col items-center min-w-0', row.locked && 'opacity-50')}>
      <Frame as="button" type="button" onClick={onPick} aria-pressed={active} aria-label={`${row.name} 고르기`}
             className={cx('w-full flex flex-col items-center gap-0.5 px-0.5 py-1 cursor-pointer text-2xs',
               active ? 'text-gold' : 'text-text-dim hover:text-text')}>
        <PixelIcon glyph={HEAD[row.id].glyph} size={16} />
        <span className="truncate max-w-full">{HEAD[row.id].label}</span>
      </Frame>
      <span className="text-2xs text-text-dim h-4">{row.locked ? `Lv${row.unlock}에 열림` : `${row.rank}/${row.cap}`}</span>
      {row.nodes.map((node, i) => (
        <div key={node.rank} className="flex flex-col items-center">
          {i > 0 && <span className={cx('block w-0.5 h-2', node.state === 'done' ? 'bg-gold' : 'bg-line')} aria-hidden="true" />}
          <Node node={node} label={`${row.name} ${node.rank}단계`} onPick={onPick} />
        </div>
      ))}
    </div>
  );
}

const NODE_TEXT: Record<BonusNode['state'], string> = { done: '이룸', next: '모으는 중', open: '열림', capped: '상한 위' };

/** 단계 노드 — 이룬 단계는 금색, 다음 단계는 모인 비율만큼 위에서 아래로 찬다 */
function Node({ node, label, onPick }: { node: BonusNode; label: string; onPick: () => void }) {
  return (
    <Frame as="button" type="button" onClick={onPick} aria-label={`${label} ${NODE_TEXT[node.state]}`}
           className={cx('relative size-8 overflow-hidden flex items-center justify-center cursor-pointer text-xs',
             node.state === 'done' && 'border-gold bg-gold/30 text-gold',
             node.state === 'next' && 'border-gold text-text',
             node.state === 'open' && 'text-text-dim',
             node.state === 'capped' && 'opacity-40 text-text-dim')}>
      {node.state === 'next' && (
        <span className="absolute inset-x-0 top-0 bg-gold/40" style={{ height: `${node.fill * 100}%` }} aria-hidden="true" />
      )}
      <span className="relative">{node.rank}</span>
    </Frame>
  );
}

/** 고른 보너스의 상세 — 지금 → 다음 효과, 모인 골드 / 비용, 기부 입력과 빠른 금액, 내 기부 */
function Detail({ row, myTotal, guildId, busy, run, setToast, onGoldChanged }: {
  row: BonusRow; myTotal: number; guildId: string; busy: boolean; run: Run; setToast: Notify;
  onGoldChanged: () => Promise<void> | void;
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
    // 상한까지 필요한 골드만 받는다 — 서버와 같은 규칙으로 실제로 받을 골드를 미리 계산해 알린다
    const accepted = applyDonation(row.pool, row.rank, row.cap, value).accepted;
    const error = await run({ op: 'donate', guildId, bonus: row.id, amount: value });
    if (error) {
      setToast(error, 'warn');
      return;
    }
    setAmount('');
    setToast(`${row.name}에 ${fmtNum(accepted)}골드를 기부했어요.`);
    await onGoldChanged();
  };

  return (
    <section aria-label={`${row.name} 상세`}><Inset className="px-2 py-2 flex flex-col gap-1.5 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-gold">{row.name}</b>
        <span className="text-xs text-text-dim">
          {row.locked ? `길드 Lv${row.unlock}에 열려요` : `${row.rank}단계 · 상한 ${row.cap}단계`}
        </span>
      </div>
      <span className="text-xs">
        {row.now ?? '효과 없음'}{row.after && <span className="text-text-dim"> → {row.after}</span>}
      </span>
      {row.canDonate && row.next !== null ? (
        <>
          <span className="block h-2 border border-line bg-surface-2" role="meter" aria-label={`${row.name} 다음 단계까지`}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.ratio * 100)}>
            <span className="block h-full bg-gold" style={{ width: `${row.ratio * 100}%` }} />
          </span>
          <span className="text-xs text-text-dim">모인 골드 {fmtNum(row.pool)} / {fmtNum(row.next)}</span>
          <form className="flex flex-col gap-1.5" onSubmit={e => { void onDonate(e); }}>
            <div className="flex gap-2">
              <TextInput compact type="number" inputMode="numeric" min={1} step={1} className="flex-1 min-w-0"
                         value={amount} placeholder={row.need === null ? '' : fmtNum(row.need)}
                         onChange={e => setAmount(e.target.value)} aria-label={`${row.name} 기부 골드`} />
              <Button type="submit" size="sm" variant="primary" disabled={busy}>기부</Button>
            </div>
            <div className="flex gap-1">
              {DONATION_STEPS.map(step => (
                <Button key={step} type="button" size="sm" disabled={busy} onClick={() => add(step)}>+{step / 10_000}만</Button>
              ))}
              <Button type="button" size="sm" disabled={busy || row.need === null} onClick={() => setAmount(String(row.need ?? ''))}>남은 만큼</Button>
            </div>
          </form>
        </>
      ) : (
        <span className="text-xs text-text-dim">
          {row.locked ? '길드 레벨이 오르면 1단계로 열려요.'
            : row.rank >= 5 ? '최고 단계예요.' : '지금 길드 레벨의 상한까지 올렸어요. 길드 레벨이 오르면 더 올릴 수 있어요.'}
        </span>
      )}
      <span className="text-xs text-text-dim">
        이 보너스에 내 기부 <b className="text-text">{fmtNum(row.mine)}</b> · 내 전체 기부 <b className="text-text">{fmtNum(myTotal)}</b>
      </span>
      <Note size="xs" className="my-0">
        길드 레벨이 오르면 그 레벨의 보너스가 1단계로 열려요. 2단계부터는 길드원 누구나 골드를 기부해 올리고,
        기부한 골드는 돌려받지 않아요.
      </Note>
    </Inset></section>
  );
}
