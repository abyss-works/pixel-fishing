import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { applyDonation } from '../../../../game/rules/guild';
import type { GuildBonusId } from '../../../../game/rules/guild';
import {
  DONATION_STEPS, GUILD_BONUS_MAX_RANK, GUILD_BONUS_TIP, GUILD_ENHANCE_LOCK_NOTE, GUILD_ENHANCE_MAX_RANK,
  GUILD_ENHANCE_MIN_LEVEL, GUILD_ERROR_TEXT, bonusRows, donateDisabledReason, enhanceInvestState, enhancePoolSummary,
  enhanceResetCostRows, enhanceResetState, personalNodes,
} from '../../../../features/guild/model/guild';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import type { BonusNode, BonusRow, PersonalNode } from '../../../../features/guild/model/guild';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import { cx } from '../../../ui/cx';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';
import { fmtNum } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';
import IconButton from '../../../ui/IconButton';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import { NOTCH_SM } from '../../../ui/notch';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';
import ProgressCount from '../../../ui/ProgressCount';
import ProgressMeter from '../../../ui/ProgressMeter';
import SlotCell from '../../../ui/SlotCell';
import SubTabs from '../../../ui/SubTabs';
import TextInput from '../../../ui/TextInput';
import Tip, { TipCard } from '../../../ui/Tip';
import type { GuildPartProps, GuildRun } from './guildProps';
import { SCROLL_Y } from '../../../ui/scrollArea';

type SkillTrack = 'shared' | 'personal';

// 길드 스킬 탭: 최상단 [공통]/[개인] 서브탭 전환으로 공용 골드 기부(1~5단계)와 개인 무료 자유 강화(Lv.6 해금, 1~5단계)를 분리한다.
// 두 서브탭 모두 동일한 5열 수직 트리와 하단 2칸 상세 골격을 유지해 전환 시 높이가 흔들리지 않는다.
export default function GuildSkillsTab({ guild, gold, busy, run, dialogHost, onResetEnhancements, setToast, onGoldChanged }: GuildPartProps & {
  gold: number;
  dialogHost?: HTMLElement | null;
  onResetEnhancements: () => Promise<{ error: string | null; recovered?: number }>;
  onGoldChanged: () => Promise<void> | void;
}) {
  const rows = bonusRows(guild.bonuses);
  const [track, setTrack] = useState<SkillTrack>('shared');
  const [picked, setPicked] = useState<GuildBonusId>(
    () => (rows.find(r => r.canDonate) ?? rows.find(r => !r.locked) ?? rows[0])?.id ?? 'sell');
  const [donating, setDonating] = useState(false);
  const [resetting, setResetting] = useState(false);

  const sel = rows.find(r => r.id === picked) ?? rows[0];
  const unlocked = guild.growth.level >= GUILD_ENHANCE_MIN_LEVEL;
  const sharedCap = Math.min(guild.growth.level, GUILD_BONUS_MAX_RANK);
  const pool = enhancePoolSummary(guild);
  const resetState = enhanceResetState(guild, gold);

  const onInvest = async (bonus: GuildBonusId) => {
    const target = rows.find(r => r.id === bonus);
    const error = await run({ op: 'enhance', guildId: guild.id, bonus });
    if (error) {
      sendNotice(setToast, { kind: 'system.modalRejected', text: error });
      return;
    }
    setPicked(bonus);
    if (target) sendNotice(setToast, {
      kind: 'guild.modalAction',
      text: `${target.name} 스킬의 내 자유 강화를 ${target.enhanceRank + 1}단계로 올렸어요.`,
      toastText: `${target.name} 개인 강화 ${target.enhanceRank + 1}단계!`,
    });
  };

  const selInvest = sel ? enhanceInvestState(guild, sel) : { canInvest: false, reason: null };
  const selFree = sel && unlocked ? sel.enhanceRank : 0;
  const selTotal = sel ? (sel.locked ? 0 : sel.rank + selFree) : 0;

  const donateDialog = donating && sel ? (
    <DonateDialog row={sel} guildId={guild.id} busy={busy} run={run} setToast={setToast}
                  onGoldChanged={onGoldChanged} onClose={() => setDonating(false)} />
  ) : null;

  const resetDialog = resetting ? (
    <ConfirmDialog
      layer="stage"
      title="내 자유 강화 되돌리기"
      confirmLabel="되돌리기"
      onCancel={() => setResetting(false)}
      onConfirm={() => {
        if (busy) return;
        const fallbackUsed = resetState.used;
        setResetting(false);
        void onResetEnhancements().then(async ({ error, recovered }) => {
          if (error) {
            sendNotice(setToast, { kind: 'system.modalRejected', text: error });
            return;
          }
          sendNotice(setToast, {
            kind: 'guild.modalAction',
            text: `내 길드 스킬 자유 강화를 되돌려 ${recovered ?? fallbackUsed}포인트를 회수했어요.`,
            toastText: '내 길드 스킬 자유 강화를 되돌렸어요.',
          });
          await onGoldChanged();
        });
      }}
    >
      <div className="flex flex-col gap-2.5">
        <p className="m-0 text-sm text-text leading-snug">
          내 자유 강화만 모두 0단계로 되돌려 포인트를 회수해요. 길드 공용 기본 단계와 다른 길드원의 강화는 그대로 남아요.
        </p>
        <Inset className="px-3 py-0.5">
          <KeyValueRow compact label="회수 포인트" value={`${resetState.used}포인트`} valueClassName="pf-accent text-guild" />
          <KeyValueRow compact label="보유 골드" value={`${fmtNum(gold)}G`} valueClassName="pf-accent text-text" />
          <KeyValueRow
            compact
            label={(
              <span className="inline-flex items-center gap-1.5">
                <span>초기화 비용</span>
                <Tip
                  wraps
                  pressOpens
                  text={(
                    <TipCard
                      title="누적 초기화 비용"
                      badge={<Badge tone="dim" size="2xs">탈퇴 후 유지</Badge>}
                      description="초기화할 때마다 비용이 올라가며, 길드를 떠나도 누적 횟수는 계정에 유지돼요."
                      rows={enhanceResetCostRows()}
                    />
                  )}
                >
                  <IconButton
                    type="button"
                    boxed
                    glyph="question"
                    size={10}
                    aria-label="초기화 비용 단계 안내"
                    className="size-5 shrink-0 border-line text-accent hover:border-gold hover:text-gold cursor-help"
                  />
                </Tip>
              </span>
            )}
            value={`${fmtNum(resetState.cost)}G`}
            valueClassName="pf-accent text-gold"
          />
          <KeyValueRow
            compact
            label="차감 후 잔여 골드"
            value={`${fmtNum(Math.max(0, gold - resetState.cost))}G`}
            valueClassName="pf-accent text-accent"
          />
        </Inset>
      </div>
    </ConfirmDialog>
  ) : null;

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <SubTabs<SkillTrack>
        className="mb-0 shrink-0"
        activeKey={track}
        onSelect={setTrack}
        items={[
          { key: 'shared', label: '공통', tone: 'gold' },
          {
            key: 'personal',
            tone: 'guild',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <span>개인</span>
                {unlocked && pool.remaining > 0 && (
                  <span className={cx('pf-accent px-1 text-2xs leading-tight bg-bg border border-epic text-guild', NOTCH_SM)}>
                    +{pool.remaining}
                  </span>
                )}
              </span>
            ),
          },
        ]}
      />

      <div className={`flex flex-col gap-2 flex-1 min-h-0 ${SCROLL_Y}`}>
        <Inset className="shrink-0 flex flex-col gap-2 px-3 py-2.5 mobile:px-2 mobile:py-2">
          <div className="h-9 mobile:h-auto mobile:min-h-9 flex items-center justify-between gap-2 pb-1.5 border-b border-line">
            {track === 'shared' ? (
              <>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Tip
                    text="기부한 골드를 모아 길드원 모두에게 적용되는 공용 기본 단계를 올려요."
                    className="text-xs font-bold text-gold"
                  >
                    공용 기본 단계
                  </Tip>
                  <div className="inline-flex items-center gap-1" aria-hidden="true">
                    {Array.from({ length: GUILD_BONUS_MAX_RANK }, (_, idx) => (
                      <span
                        key={idx}
                        className={cx(
                          'size-2.5 border',
                          NOTCH_SM,
                          idx < sharedCap ? 'bg-gold border-gold-dark' : 'bg-bg border-line-dim',
                        )}
                      />
                    ))}
                  </div>
                  <span className="pf-accent text-xs text-gold">
                    {sharedCap} / {GUILD_BONUS_MAX_RANK}
                  </span>
                </div>
                <Badge tone="gold" size="xs" pixel>길드 Lv.{guild.growth.level}</Badge>
              </>
            ) : unlocked ? (
              <>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Tip
                    text={(
                      <TipCard
                        title="길드 스킬 강화 규칙"
                        description={'자유 강화 포인트와 효과는 길드원마다 따로 적용돼요.\n기부로 올리는 기본 단계는 모든 길드원이 함께 받고, 내 포인트로 올리는 개인 자유 강화는 나에게만 추가로 적용돼요.'}
                      />
                    )}
                    className="text-xs font-bold text-guild"
                  >
                    남은 강화 포인트
                  </Tip>
                  <div className="inline-flex items-center gap-1" aria-hidden="true">
                    {Array.from({ length: pool.maxSlots }, (_, idx) => {
                      const state = idx >= pool.max ? 'locked' : idx < pool.remaining ? 'avail' : 'spent';
                      return (
                        <span
                          key={idx}
                          className={cx(
                            'size-2.5 border',
                            NOTCH_SM,
                            state === 'avail' && 'bg-guild border-epic',
                            state === 'spent' && 'bg-[color-mix(in_oklab,var(--c-epic)_22%,var(--c-bg))] border-epic/65',
                            state === 'locked' && 'bg-bg border-line-dim',
                          )}
                        />
                      );
                    })}
                  </div>
                  <span className={cx('pf-accent text-xs', pool.remaining > 0 ? 'text-guild' : 'text-text-dim')}>
                    {pool.remaining} / {pool.max}
                  </span>
                </div>
                {resetState.canReset ? (
                  <Tip wraps text={`${fmtNum(resetState.cost)}G를 내고 내 자유 강화만 되돌릴 수 있어요.`}>
                    <Button size="sm" disabled={busy} onClick={() => setResetting(true)}>되돌리기</Button>
                  </Tip>
                ) : (
                  <Tip wraps text={resetState.reason ?? ''}>
                    <Button size="sm" disabled className="pointer-events-none">되돌리기</Button>
                  </Tip>
                )}
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs text-text-dim min-w-0">
                  <PixelIcon glyph="lock" size={12} className="shrink-0" />
                  <span>{GUILD_ENHANCE_LOCK_NOTE}</span>
                </span>
                <Badge tone="gold" size="xs" pixel>길드 Lv.{guild.growth.level}</Badge>
              </>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2.5 mobile:grid-cols-1 mobile:gap-1" role="group" aria-label="길드 스킬 트리">
            {rows.map(row => (
              <Branch
                key={row.id}
                row={row}
                track={track}
                unlocked={unlocked}
                remaining={pool.remaining}
                active={row.id === picked}
                onPick={() => setPicked(row.id)}
              />
            ))}
          </div>
        </Inset>

        {sel && (
          <div className="grid grid-cols-2 gap-2.5 shrink-0 mobile:grid-cols-1">
            <Inset className="p-2.5 min-h-[126px] flex flex-col gap-1">
              <section aria-label={`${sel.name} 효과`} className="flex flex-col gap-1 flex-1">
                <div className="flex items-baseline justify-between gap-2 pb-1 border-b border-line/60">
                  <b className={cx('font-bold', track === 'personal' ? 'text-guild' : 'text-gold')}>{sel.name}</b>
                  <span className="text-2xs text-text-dim whitespace-nowrap">
                    {sel.locked
                      ? '잠김'
                      : track === 'shared'
                        ? `공용 기본 ${sel.rank}단계`
                        : `개인 ${selFree}단계 (합산 ${selTotal}단계)`}
                  </span>
                </div>
                {track === 'shared' ? (
                  <>
                    <ValueRow label={`현재(${sel.rank}단계)`} value={sel.baseNow ?? '-'} tone="gold" />
                    <ValueRow
                      label={sel.rank >= GUILD_BONUS_MAX_RANK ? '다음 단계' : `다음(${sel.rank + 1}단계)`}
                      value={sel.rank >= GUILD_BONUS_MAX_RANK ? `기본 최대 ${GUILD_BONUS_MAX_RANK}단계` : sel.baseAfter ?? '-'}
                      tone="accent"
                    />
                  </>
                ) : (
                  <>
                    <ValueRow label={`현재(개인 ${selFree}단계)`} value={sel.locked ? '-' : sel.enhanceNow} tone="guild" />
                    <ValueRow
                      label={selFree >= GUILD_ENHANCE_MAX_RANK ? '다음 단계' : `다음(개인 ${selFree + 1}단계)`}
                      value={selFree >= GUILD_ENHANCE_MAX_RANK ? `개인 최대 ${GUILD_ENHANCE_MAX_RANK}단계` : sel.enhanceAfter ?? '-'}
                      tone="accent"
                    />
                  </>
                )}
                <p className="m-0 mt-auto pt-1 text-2xs text-text-dim leading-snug">
                  <HighlightRarityText text={GUILD_BONUS_TIP[sel.id]} />
                </p>
              </section>
            </Inset>

            <Inset className="p-2.5 min-h-[126px] flex flex-col gap-1.5">
              {track === 'shared' ? (
                <>
                  <ValueRow
                    label="모인 골드"
                    value={sel.locked ? '-' : sel.rank >= GUILD_BONUS_MAX_RANK
                      ? `${GUILD_BONUS_MAX_RANK}단계 완료`
                      : sel.next === null
                        ? '현재 상한'
                        : <ProgressCount current={sel.pool} target={sel.next} />}
                  />
                  <ProgressMeter
                    current={Math.round(sel.ratio * 100)}
                    target={100}
                    ratio={sel.ratio}
                    tone="gold"
                    ariaLabel={`${sel.name} 다음 단계까지`}
                  />
                  <p className="m-0 text-2xs text-text-dim">기부한 골드는 돌려받지 않아요.</p>
                  <div className="mt-auto pt-0.5">
                    {sel.canDonate ? (
                      <Button variant="primary" size="sm" full disabled={busy} onClick={() => setDonating(true)}>기부</Button>
                    ) : (
                      <Tip wraps text={donateDisabledReason(sel)} className="block">
                        <Button variant="primary" size="sm" full disabled className="pointer-events-none">기부</Button>
                      </Tip>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <ValueRow
                    label="개인 강화 단계"
                    value={!unlocked
                      ? 'Lv.6 해금'
                      : sel.locked
                        ? '잠김'
                        : `${selFree} / ${GUILD_ENHANCE_MAX_RANK}단계 (필요 포인트 1)`}
                    tone="guild"
                    className="mobile:h-auto mobile:min-h-6 mobile:flex-wrap mobile:gap-x-1.5 mobile:gap-y-0.5"
                    valueClassName="mobile:whitespace-normal mobile:overflow-visible mobile:text-clip"
                  />
                  <ProgressMeter
                    current={unlocked && !sel.locked ? selFree : 0}
                    target={GUILD_ENHANCE_MAX_RANK}
                    ratio={unlocked && !sel.locked ? selFree / GUILD_ENHANCE_MAX_RANK : 0}
                    tone="guild"
                    ariaLabel={`${sel.name} 개인 강화 단계`}
                  />
                  <p className="m-0 text-2xs text-text-dim">
                    {!unlocked
                      ? GUILD_ENHANCE_LOCK_NOTE
                      : sel.locked
                        ? `길드 Lv.${sel.unlock}에 열려요.`
                        : `공용 기본 ${sel.rank}단계와 더해 총 ${sel.totalEffect}가 적용돼요.`}
                  </p>
                  <div className="mt-auto pt-0.5">
                    {selInvest.canInvest ? (
                      <Button
                        size="sm"
                        full
                        disabled={busy}
                        className="bg-[color-mix(in_oklab,var(--c-epic)_20%,var(--c-bg))] border-epic text-guild hover:bg-epic hover:text-bg"
                        onClick={() => { void onInvest(sel.id); }}
                      >
                        강화 올리기
                      </Button>
                    ) : (
                      <Tip wraps text={selInvest.reason ?? ''} className="block">
                        <Button size="sm" full disabled className="pointer-events-none">
                          {unlocked ? '강화 올리기' : 'Lv.6 해금'}
                        </Button>
                      </Tip>
                    )}
                  </div>
                </>
              )}
            </Inset>
          </div>
        )}
      </div>

      {donateDialog && (dialogHost ? createPortal(donateDialog, dialogHost) : donateDialog)}
      {resetDialog && (dialogHost ? createPortal(resetDialog, dialogHost) : resetDialog)}
    </div>
  );
}

/** 이름은 왼쪽, 값은 오른쪽인 한 줄 */
function ValueRow({ label, value, tone, className, valueClassName }: {
  label: string; value: ReactNode; tone?: 'gold' | 'guild' | 'accent'; className?: string; valueClassName?: string;
}) {
  const toneClass = tone === 'gold' ? 'text-gold' : tone === 'guild' ? 'text-guild' : tone === 'accent' ? 'text-accent' : undefined;
  return (
    <KeyValueRow
      compact
      className={cx('h-6', className)}
      label={label}
      value={value}
      valueClassName={cx('pf-accent', toneClass, valueClassName)}
    />
  );
}

/** 스킬 머리의 픽셀 아이콘 */
const GLYPH: Record<GuildBonusId, GlyphId> = { sell: 'coin', bag: 'fish', named: 'star', rare: 'rod', mutation: 'plus' };

/** 스킬 한 열: 볼록한 머리(아이콘, 이름), 5칸 단계(공통 금색/개인 보라색), 열 하단 푸터 */
function Branch({ row, track, unlocked, remaining, active, onPick }: {
  row: BonusRow;
  track: SkillTrack;
  unlocked: boolean;
  remaining: number;
  active: boolean;
  onPick: () => void;
}) {
  const isPersonal = track === 'personal';
  const pNodes = isPersonal ? personalNodes(row, unlocked, remaining) : null;
  const free = unlocked ? row.enhanceRank : 0;
  const footerText = row.locked
    ? '잠김'
    : isPersonal
      ? (unlocked ? `${free}단계` : 'Lv.6 해금')
      : `${row.rank}단계`;
  const footerActive = active && !row.locked && (!isPersonal || unlocked);

  return (
    <div className={cx(
      'flex flex-col items-center min-w-0',
      'mobile:grid mobile:grid-cols-[minmax(0,1fr)_auto] mobile:items-center mobile:gap-x-2 mobile:gap-y-1.5 mobile:p-1.5 mobile:bg-bg mobile:border mobile:border-line',
      active && (isPersonal ? 'mobile:border-epic mobile:bg-(--inset-light)' : 'mobile:border-gold mobile:bg-(--inset-light)'),
      row.locked && 'text-text-dim mobile:border-line-dim',
    )}>
      <Tip
        wraps
        pressOpens
        text={(
          <TipCard
            title={row.name}
            description={GUILD_BONUS_TIP[row.id]}
            badge={row.locked ? <Badge tone="dim-plain" size="2xs">잠김</Badge> : undefined}
            status={row.locked ? { tone: 'lock', lines: [`길드 Lv.${row.unlock}에 열려요.`] } : undefined}
          />
        )}
        className="block w-full mobile:col-start-1 mobile:row-start-1 mobile:min-w-0"
      >
        <SlotCell
          form={row.locked ? 'sunken' : active ? 'pressed' : 'raised'}
          tone={isPersonal ? 'guild' : 'gold'}
          ariaDisabled={row.locked}
          ariaPressed={active}
          ariaLabel={`${row.name} 고르기`}
          onSelect={onPick}
          className={cx(
            'w-full h-11 px-1 flex flex-col items-center justify-center gap-0.5 text-2xs leading-tight',
            'mobile:h-7 mobile:flex-row mobile:justify-start mobile:gap-1.5 mobile:px-2 mobile:text-left',
            !row.locked && active
              ? cx(isPersonal ? 'text-guild' : 'text-gold', 'bg-[color-mix(in_oklab,var(--c-surface-2)_70%,var(--c-bg))]')
              : !row.locked && 'text-text hover:border-accent',
          )}
        >
          <PixelIcon glyph={GLYPH[row.id]} size={14} className={cx('shrink-0', !active && 'text-text-dim')} />
          <span className="text-center mobile:text-left mobile:truncate">{row.name}</span>
        </SlotCell>
      </Tip>

      {isPersonal && pNodes ? (
        <div
          className="flex flex-col items-center mt-1.5 mobile:col-start-1 mobile:row-start-2 mobile:justify-self-start mobile:flex-row mobile:justify-start mobile:gap-1 mobile:mt-0"
          aria-label={`${row.name} 개인 자유 강화 ${free}단계`}
        >
          {pNodes.map((pNode, i) => (
            <div key={pNode.rank} className="flex flex-col items-center mobile:flex-row">
              {i > 0 && (
                <span className={cx('block w-0.5 h-0.5 mobile:hidden', pNode.state === 'done' ? 'bg-guild' : 'bg-line')} aria-hidden="true" />
              )}
              <Tip plain text={personalNodeTip(row.name, pNode, row.locked ? row.unlock : null, unlocked)} className="inline-flex">
                <span className="inline-flex items-center justify-center p-[2px] border border-transparent bg-transparent mobile:p-px">
                  <PersonalStepNode node={pNode} label={`${row.name} ${pNode.rank}단계`} />
                </span>
              </Tip>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col items-center mt-1.5 mobile:col-start-1 mobile:row-start-2 mobile:justify-self-start mobile:flex-row mobile:justify-start mobile:gap-1 mobile:mt-0"
          aria-label={`${row.name} 공용 기본 ${row.rank}단계`}
        >
          {row.nodes.map((node, i) => (
            <div key={node.rank} className="flex flex-col items-center mobile:flex-row">
              {i > 0 && (
                <span className={cx('block w-0.5 h-0.5 mobile:hidden', node.state === 'done' ? 'bg-gold' : 'bg-line')} aria-hidden="true" />
              )}
              <Tip plain text={nodeTip(row.name, node)} className="inline-flex">
                <span className="inline-flex items-center justify-center p-[2px] border border-transparent bg-transparent mobile:p-px">
                  <Node node={node} label={`${row.name} ${node.rank}단계`} />
                </span>
              </Tip>
            </div>
          ))}
        </div>
      )}

      <div className={cx(
        'mt-1.5 w-full h-7 px-1.5 flex items-center justify-center bg-bg border',
        'mobile:contents',
        footerActive ? (isPersonal ? 'border-epic' : 'border-gold-dark') : 'border-line-dim',
      )}>
        <span className={cx(
          'pf-accent text-2xs whitespace-nowrap',
          'mobile:col-start-2 mobile:row-start-1 mobile:justify-self-end',
          footerActive ? cx(isPersonal ? 'text-guild' : 'text-gold', 'font-bold') : 'text-text-dim',
        )}>
          {footerText}
        </span>
      </div>
    </div>
  );
}

const NODE_TEXT: Record<BonusNode['state'], string> = { done: '이룸', next: '모으는 중', open: '열림', capped: '상한 위' };
const PERSONAL_NODE_TEXT: Record<PersonalNode['state'], string> = {
  done: '이룸',
  next: '투자 가능',
  open: '열림',
  locked: '잠김',
};

function nodeTip(skillName: string, node: BonusNode) {
  return (
    <TipCard
      title={`${skillName} ${node.rank}단계`}
      badge={<Badge tone={node.state === 'done' ? 'gold' : 'dim-plain'} size="2xs">{NODE_TEXT[node.state]}</Badge>}
    />
  );
}

function personalNodeTip(skillName: string, node: PersonalNode, unlockLevel: number | null, unlocked: boolean) {
  const statusLines = !unlocked
    ? [GUILD_ENHANCE_LOCK_NOTE]
    : unlockLevel !== null
      ? [`길드 Lv.${unlockLevel}에 열려요.`]
      : undefined;
  return (
    <TipCard
      title={`${skillName} 개인 ${node.rank}단계`}
      badge={<Badge tone={node.state === 'done' ? 'gold' : 'dim-plain'} size="2xs">{PERSONAL_NODE_TEXT[node.state]}</Badge>}
      status={statusLines ? { tone: 'lock', lines: statusLines } : undefined}
    />
  );
}

/** 공용 기본 단계 노드: 이룬 단계는 금색 채움, 다음 단계는 모인 비율 채움, 상한 위는 흐린 칸 */
function Node({ node, label }: { node: BonusNode; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${label} ${NODE_TEXT[node.state]}`}
      className={cx(
        'relative w-6 h-[18px] mobile:size-4 overflow-hidden flex items-center justify-center pf-accent text-2xs border',
        NOTCH_SM,
        node.state === 'done' && 'border-gold-dark bg-gold text-bg',
        node.state === 'next' && 'border-gold bg-surface-2 text-text',
        node.state === 'open' && 'border-line bg-surface-2 text-text-dim',
        node.state === 'capped' && 'border-line-dim bg-bg text-text-dim',
      )}
    >
      {node.state === 'next' && (
        <span className="absolute inset-x-0 top-0 bg-gold/45" style={{ height: `${node.fill * 100}%` }} aria-hidden="true" />
      )}
      <span className="relative">{node.rank}</span>
    </span>
  );
}

/** 개인 자유 강화 단계 노드: 이룬 단계는 보라색 채움, 다음 투자 가능 단계는 보라색 테두리 */
function PersonalStepNode({ node, label }: { node: PersonalNode; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${label} ${PERSONAL_NODE_TEXT[node.state]}`}
      className={cx(
        'relative w-6 h-[18px] mobile:size-4 overflow-hidden flex items-center justify-center pf-accent text-2xs border',
        NOTCH_SM,
        node.state === 'done' && 'border-epic bg-guild text-bg font-bold',
        node.state === 'next' && 'border-epic bg-[color-mix(in_oklab,var(--c-epic)_15%,var(--c-bg))] text-text',
        node.state === 'open' && 'border-line bg-surface-2 text-text-dim',
        node.state === 'locked' && 'border-line-dim bg-bg text-text-dim',
      )}
    >
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
      sendNotice(setToast, { kind: 'system.modalRejected', text: GUILD_ERROR_TEXT['bad-amount'], toastText: '기부할 골드를 입력해 주세요.' });
      return;
    }
    // 상한까지 필요한 골드만 받는다. 서버와 같은 규칙으로 실제로 받을 골드를 미리 계산해 알린다
    const accepted = applyDonation(row.pool, row.rank, row.cap, value).accepted;
    const error = await run({ op: 'donate', guildId, bonus: row.id, amount: value });
    if (error) {
      sendNotice(setToast, { kind: 'system.modalRejected', text: error });
      return;
    }
    onClose();
    sendNotice(setToast, {
      kind: 'guild.modalAction',
      text: `${row.name}에 ${fmtNum(accepted)}G를 기부했어요.`,
      toastText: `${row.name} ${fmtNum(accepted)}G 기부!`,
    });
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
