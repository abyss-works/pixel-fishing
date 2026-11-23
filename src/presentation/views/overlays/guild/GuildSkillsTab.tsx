import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { applyDonation } from '../../../../game/rules/guild';
import type { GuildBonusId } from '../../../../game/rules/guild';
import {
  DONATION_STEPS, GUILD_BONUS_TIP, GUILD_ENHANCE_MAX_TOTAL_RANK, GUILD_ERROR_TEXT,
  bonusRows, enhanceInvestState, enhancePoolSummary, enhanceResetState,
} from '../../../../features/guild/model/guild';
import type { BonusNode, BonusRow } from '../../../../features/guild/model/guild';
import Button from '../../../ui/Button';
import ConfirmDialog from '../../../ui/ConfirmDialog';
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

// 길드 스킬 탭: 오목한 판 위의 강화 포인트 줄과 스킬 트리, 그 아래 고른 스킬의 두 칸(효과, 모인 골드와 기부·강화 버튼).
// 스킬 다섯이 가로로 놓이고(모바일에서는 가로 5칸 행) 기본 단계 1~5가 위에서 아래로 뻗는다.
// 자유 강화(1~5)가 적용된 칸은 기존 금색 칸 바깥에 보라색 테두리로 함께 표시한다.
export default function GuildSkillsTab({ guild, gold, busy, run, setToast, onGoldChanged }: GuildPartProps & {
  gold: number;
  onGoldChanged: () => Promise<void> | void;
}) {
  const rows = bonusRows(guild.bonuses);
  const [picked, setPicked] = useState<GuildBonusId>(
    () => (rows.find(r => r.canDonate) ?? rows.find(r => !r.locked) ?? rows[0])?.id ?? 'sell');
  const [donating, setDonating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const sel = rows.find(r => r.id === picked) ?? rows[0];
  const pool = enhancePoolSummary(guild);
  const resetState = enhanceResetState(guild, gold);

  const onInvest = async (bonus: GuildBonusId) => {
    const target = rows.find(r => r.id === bonus);
    const error = await run({ op: 'enhance', guildId: guild.id, bonus });
    if (error) {
      setToast(error, 'warn');
      return;
    }
    setPicked(bonus);
    if (target) setToast(`${target.name} 스킬을 강화 ${target.enhanceRank + 1}단계로 올렸어요.`);
  };

  const selInvest = sel ? enhanceInvestState(guild, sel) : { canInvest: false, reason: null };

  return (
    <div className={`flex flex-col gap-2 flex-1 min-h-0 ${SCROLL_Y}`}>
      <Inset className="shrink-0 flex flex-col gap-2 px-3 py-2.5 mobile:px-2 mobile:py-2">
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-line flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Tip text={'Lv.6부터 레벨이 오를 때마다 강화 포인트 1개를 얻어요.\n원하는 스킬에 무료로 자유 강화를 올릴 수 있어요.'}
                 className="text-xs font-bold text-text">
              남은 강화 포인트
            </Tip>
            <div className="inline-flex items-center gap-1" aria-hidden="true">
              {Array.from({ length: pool.maxSlots }, (_, idx) => {
                const state = idx >= pool.max ? 'locked' : idx < pool.remaining ? 'avail' : 'spent';
                return (
                  <span key={idx}
                        className={cx('size-2.5 border',
                          '[clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]',
                          state === 'avail' && 'bg-guild border-epic',
                          state === 'spent' && 'bg-[#3d2154] border-[#7c449e]',
                          state === 'locked' && 'bg-bg border-line opacity-35')} />
                );
              })}
            </div>
            <span className={cx('pf-accent text-xs', pool.remaining > 0 ? 'text-guild' : 'text-text-dim')}>
              {pool.remaining} / {pool.max}
            </span>
          </div>
          {resetState.canReset ? (
            <Tip wraps text={`길드원 누구나 ${fmtNum(resetState.cost)}G를 내고 투자한 강화 포인트를 모두 되돌릴 수 있어요.`}>
              <Button size="sm" disabled={busy} onClick={() => setResetting(true)}>초기화</Button>
            </Tip>
          ) : (
            <Tip wraps text={resetState.reason ?? ''}>
              <Button size="sm" disabled className="pointer-events-none">초기화</Button>
            </Tip>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-2 py-1 bg-bg border border-line text-2xs text-text-dim"
             aria-label="스킬 단계 색상 안내">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-block size-3 bg-gold border-2 border-gold-dark" aria-hidden="true" />
            노란색 채움: 기본 단계
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-flex items-center justify-center p-px bg-[#311744] border-2 border-guild" aria-hidden="true">
              <span className="block size-2 bg-gold border border-gold-dark" />
            </span>
            보라색 테두리: 자유 강화
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2.5 mobile:grid-cols-1 mobile:gap-1" role="group" aria-label="길드 스킬 트리">
          {rows.map(row => (
            <Branch key={row.id} row={row} active={row.id === picked} busy={busy}
                    invest={enhanceInvestState(guild, row)}
                    onPick={() => setPicked(row.id)}
                    onInvest={() => { void onInvest(row.id); }} />
          ))}
        </div>
      </Inset>

      {sel && (
        <div className="grid grid-cols-2 gap-2.5 shrink-0 mobile:grid-cols-1">
          <Inset className="p-2.5 flex flex-col gap-1">
            <section aria-label={`${sel.name} 효과`} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 pb-1">
                <Tip text={GUILD_BONUS_TIP[sel.id]} className="font-bold text-gold">{sel.name}</Tip>
                <span className="text-xs text-text-dim whitespace-nowrap">
                  {sel.locked ? '잠김' : sel.enhanceRank > 0 ? (
                    <>기본 {sel.rank} + 강화 {sel.enhanceRank} = <strong className="pf-accent text-guild">{sel.totalRank}단계</strong></>
                  ) : (
                    <>기본 <strong className="pf-accent text-text">{sel.rank}단계</strong></>
                  )}
                </span>
              </div>
              <ValueRow label={`현재(${sel.totalRank}단계)`} value={sel.now ?? '-'} />
              <ValueRow label={sel.totalRank >= GUILD_ENHANCE_MAX_TOTAL_RANK ? '다음 단계' : `다음(${sel.totalRank + 1}단계)`}
                        value={sel.totalRank >= GUILD_ENHANCE_MAX_TOTAL_RANK ? '최대 10단계' : sel.after ?? '-'} up />
            </section>
          </Inset>

          <Inset className="p-2.5 flex flex-col gap-1.5">
            <ValueRow label="모인 골드"
                      value={sel.locked ? '-' : sel.next === null ? '5단계 완료' : `${fmtNum(sel.pool)} / ${fmtNum(sel.next)}`} />
            <span className="block h-2 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]" role="meter"
                  aria-label={`${sel.name} 다음 단계까지`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sel.ratio * 100)}>
              <span className="block h-full bg-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" style={{ width: `${sel.ratio * 100}%` }} />
            </span>
            <div className="grid grid-cols-2 gap-2 mt-auto pt-0.5">
              {sel.canDonate ? (
                <Button variant="primary" size="sm" full disabled={busy} onClick={() => setDonating(true)}>기부</Button>
              ) : (
                <Tip wraps text={GUILD_ERROR_TEXT[sel.locked ? 'bonus-locked' : 'rank-maxed']} className="block">
                  <Button variant="primary" size="sm" full disabled className="pointer-events-none">기부</Button>
                </Tip>
              )}
              {selInvest.canInvest ? (
                <Button size="sm" full disabled={busy}
                        className="bg-[#2b1640] border-epic text-guild hover:bg-epic hover:text-[#08111f]"
                        onClick={() => { void onInvest(sel.id); }}>
                  강화 올리기
                </Button>
              ) : (
                <Tip wraps text={selInvest.reason ?? ''} className="block">
                  <Button size="sm" full disabled className="pointer-events-none">강화 올리기</Button>
                </Tip>
              )}
            </div>
          </Inset>
        </div>
      )}

      {donating && sel && (
        <DonateDialog row={sel} guildId={guild.id} busy={busy} run={run} setToast={setToast}
                      onGoldChanged={onGoldChanged} onClose={() => setDonating(false)} />
      )}

      {resetting && (
        <ConfirmDialog
          layer="stage"
          title="길드 스킬 강화 초기화"
          confirmLabel="초기화"
          onCancel={() => setResetting(false)}
          onConfirm={() => {
            if (busy) return;
            setResetting(false);
            void run({ op: 'resetEnhancements', guildId: guild.id }).then(async error => {
              if (error) {
                setToast(error, 'warn');
                return;
              }
              setToast(`길드 스킬 강화를 초기화해 ${resetState.used}포인트를 되돌렸어요.`);
              await onGoldChanged();
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Inset className="p-2.5 flex flex-col gap-1">
              <div className="flex items-center justify-between pb-1 border-b border-line text-sm">
                <span className="font-bold text-text">돌려받을 포인트</span>
                <span className="pf-accent text-xs text-gold font-bold">{resetState.used}포인트</span>
              </div>
              {rows.filter(r => r.enhanceRank > 0).map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-text-dim">{r.name}</span>
                  <span className="pf-accent text-guild">강화 {r.enhanceRank}단계 회수</span>
                </div>
              ))}
            </Inset>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-dim">필요 골드</span>
              <span className="pf-accent text-gold">{fmtNum(resetState.cost)}G</span>
            </div>
            <p className="m-0 text-2xs text-text-dim">초기화에 쓴 골드는 돌려받지 않아요.</p>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** 이름은 왼쪽, 값은 오른쪽인 한 줄 */
function ValueRow({ label, value, up }: { label: string; value: string; up?: boolean }) {
  return (
    <span className="flex items-center justify-between gap-3 h-6 border-t border-line/60 first:border-t-0">
      <span className="text-xs text-text-dim">{label}</span>
      <span className={cx('pf-accent text-xs', up && 'text-guild')}>{value}</span>
    </span>
  );
}

/** 스킬 머리의 픽셀 아이콘 */
const GLYPH: Record<GuildBonusId, GlyphId> = { sell: 'coin', bag: 'fish', named: 'star', rare: 'rod', mutation: 'plus' };

/** 스킬 한 열: 볼록한 머리(아이콘, 이름), 5칸 단계(자유 강화 시 보라색 바깥 테두리), 합산 단계와 +1 강화 버튼 */
function Branch({ row, active, busy, invest, onPick, onInvest }: {
  row: BonusRow; active: boolean; busy: boolean;
  invest: { canInvest: boolean; reason: string | null };
  onPick: () => void; onInvest: () => void;
}) {
  return (
    <div className={cx(
      'flex flex-col items-center min-w-0',
      'mobile:grid mobile:grid-cols-[minmax(0,6.25rem)_minmax(0,1fr)_auto] mobile:items-center mobile:gap-1.5 mobile:p-1 mobile:bg-bg mobile:border mobile:border-line',
      active && 'mobile:border-gold mobile:bg-[#142642]',
      row.locked && 'opacity-45',
    )}>
      <Tip wraps pressOpens text={row.locked ? `길드 Lv.${row.unlock}에 열려요.` : GUILD_BONUS_TIP[row.id]} className="block w-full">
        <Frame as="button" type="button" onClick={row.locked ? undefined : onPick} aria-disabled={row.locked || undefined}
               aria-pressed={active} aria-label={`${row.name} 고르기`}
               className={cx('w-full h-11 px-1 flex flex-col items-center justify-center gap-0.5 text-2xs leading-tight',
                 'mobile:h-8 mobile:flex-row mobile:justify-start mobile:gap-1 mobile:px-1.5 mobile:text-left',
                 row.locked ? 'cursor-default' : 'cursor-pointer',
                 active
                   ? 'border-gold text-gold bg-[color-mix(in_oklab,var(--c-surface-2)_70%,var(--c-bg))] translate-y-px shadow-[inset_2px_2px_0_var(--bevel-hi),inset_-2px_-2px_0_var(--bevel-lo)]'
                   : 'text-text bg-surface-2 hover:border-accent')}>
          <PixelIcon glyph={GLYPH[row.id]} size={14} className="shrink-0" />
          <span className="text-center mobile:text-left mobile:truncate">{row.name}</span>
        </Frame>
      </Tip>
      <div className="flex flex-col items-center mt-1.5 mobile:flex-row mobile:justify-center mobile:gap-0.5 mobile:mt-0"
           aria-label={`${row.name} 기본 ${row.rank}단계 자유 강화 ${row.enhanceRank}단계`}>
        {row.nodes.map((node, i) => (
          <div key={node.rank} className="flex flex-col items-center mobile:flex-row">
            {i > 0 && <span className={cx('block w-0.5 h-0.5 mobile:hidden', node.state === 'done' ? 'bg-gold' : 'bg-line')} aria-hidden="true" />}
            <span className={cx(
              'inline-flex items-center justify-center p-[2px] border-2 mobile:p-px',
              node.enhanced
                ? 'border-guild bg-[#311744] shadow-[0_0_0_1px_var(--c-epic),inset_0_0_0_1px_var(--c-epic)]'
                : 'border-transparent bg-transparent',
            )}>
              <Node node={node} label={`${row.name} ${node.rank}단계`} />
            </span>
          </div>
        ))}
      </div>
      <div className={cx(
        'mt-1.5 w-full px-1.5 py-0.5 flex items-center justify-between gap-1 bg-bg border border-line',
        'mobile:mt-0 mobile:w-auto mobile:p-0 mobile:border-0 mobile:bg-transparent',
        row.enhanceRank > 0 && 'border-epic bg-[#1b1229]',
      )}>
        <span className={cx('pf-accent text-2xs whitespace-nowrap', row.enhanceRank > 0 ? 'text-guild font-bold' : 'text-text-dim')}>
          {row.locked ? '잠김' : `${row.totalRank}단계`}
        </span>
        {invest.canInvest ? (
          <Button size="sm" disabled={busy} onClick={onInvest}
                  aria-label={`${row.name} 강화 1단계 올리기`}
                  className="h-5 min-w-7 px-1.5 py-0 pf-accent text-2xs font-bold bg-[#2b1640] border border-epic text-guild hover:bg-epic hover:text-[#08111f]">
            +1
          </Button>
        ) : (
          <Tip wraps text={invest.reason ?? ''}>
            <Button size="sm" disabled aria-label={`${row.name} 강화 불가`}
                    className="h-5 min-w-7 px-1.5 py-0 pf-accent text-2xs font-bold bg-surface border border-line text-text-dim pointer-events-none">
              +1
            </Button>
          </Tip>
        )}
      </div>
    </div>
  );
}

const NODE_TEXT: Record<BonusNode['state'], string> = { done: '이룸', next: '모으는 중', open: '열림', capped: '상한 위' };

/** 단계 노드: 이룬 단계는 금색으로 볼록하게 차고, 다음 단계는 모인 비율만큼 위에서 아래로 찬다. 상한 위는 오목하고 흐리다 */
function Node({ node, label }: { node: BonusNode; label: string }) {
  return (
    <span role="img" aria-label={`${label} ${NODE_TEXT[node.state]}${node.enhanced ? ' 자유 강화 적용' : ''}`}
          className={cx('relative w-6 h-[18px] mobile:size-4 overflow-hidden flex items-center justify-center pf-accent text-2xs border-2',
            '[clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]',
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
  const formId = useId();
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
      <ModalCard title={`${row.name} 기부`} onClose={onClose}
        confirm={<Button type="submit" form={formId} variant="primary" full disabled={busy}>기부</Button>}>
        <form id={formId} className="flex flex-col gap-3" onSubmit={e => { void onDonate(e); }}>
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
        </form>
      </ModalCard>
    </Modal>
  );
}
