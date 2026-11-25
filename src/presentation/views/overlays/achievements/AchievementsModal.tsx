import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { GameAction } from '../../../../game/rules/actions';
import type { AchievementTab } from '../../../../game/content/achievements';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import { when } from '../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { GUEST_LOCK_DEFAULT_LINES } from '../../../../features/display/model/menuLock';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import {
  ACHIEVEMENT_TABS,
  COSMETIC_FILTERS,
  achievementSummary,
  cosmeticCards,
  cosmeticFilterStats,
  cumulativeBonusCards,
  progressZoneGroups,
  tabClaimableCount,
} from '../../../../features/achievement/model/achievements';
import type { AchievementRow, CosmeticFilter, CumulativeBonusCardModel } from '../../../../features/achievement/model/achievements';
import { fmtGold, fmtNum, josa } from '../../../ui/format';
import { SCROLL_Y } from '../../../ui/scrollArea';
import Button from '../../../ui/Button';
import CountBadge from '../../../ui/CountBadge';
import Inset from '../../../ui/Inset';
import { LockTip } from '../../../ui/Locked';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import PixelIcon from '../../../ui/PixelIcon';
import Subheading from '../../../ui/Subheading';
import TabBar from '../../../ui/TabBar';
import Tip from '../../../ui/Tip';
import ToggleChip from '../../../ui/ToggleChip';
import type { Notify } from '../../../ui/hud/messageFeed';
import { hatById } from '../../../../game/content/wardrobe';
import AchievementCard, { CumulativeBonusCard, NamedGroupCard } from './AchievementCard';

interface Props {
  game: GameState;
  /** 게스트 여부 — 게스트는 수령이 거절되므로 버튼은 잠긴다 */
  guest?: boolean;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onOpenStatsBonus?: () => void;
  onClose: () => void;
}

const CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-2';

const sortBonusDoneLast = (cards: readonly CumulativeBonusCardModel[]) =>
  [...cards].sort((a, b) => Number(a.allDone) - Number(b.allDone));

// 업적 창 — 진행, 누적 보너스, 치장 탭 셋으로 나눈다.
// 상단 요약 바는 구분선 없는 흐름 배치로 모바일 줄바꿈에서도 고아 선이 생기지 않는다.
// 진행 탭은 구역 소제목 묶음 + 미완료만 보기 토글, 누적 보너스는 전역/구역별/유물 3묶음 + 스탯 창 보너스 탭 바로가기,
// 치장 탭은 3열 모바일 노치 토글 칩 필터를 제공한다.
export default function AchievementsModal({ game, guest = false, dispatch, setToast, onOpenStatsBonus, onClose }: Props) {
  const [tab, setTab] = useState<AchievementTab>('progress');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [cosmeticFilter, setCosmeticFilter] = useState<CosmeticFilter>('all');
  const [busy, setBusy] = useState(false);

  const summary = achievementSummary(game, guest);
  const tabs = ACHIEVEMENT_TABS.map(t => ({
    ...t,
    count: tabClaimableCount(game, t.key),
  }));

  const run = (action: GameAction, onOk: (r: Extract<DispatchResult, { status: 'ok' }>) => void) => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') onOk(r);
      else if (r.status === 'rejected') sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
    });
  };

  const claimOne = (row: AchievementRow) => {
    run({ type: 'claimAchievement', id: row.def.id }, () => {
      const reward = row.def.reward.kind === 'gold'
        ? fmtGold(row.def.reward.gold)
        : (hatById(row.def.reward.hatId)?.name ?? '모자');
      sendNotice(setToast, {
        kind: 'achievement.claimed',
        text: `“${row.def.name}” 업적 보상으로 ${josa(reward, '을/를')} 받았어요!`,
        toastText: `업적 보상 ${reward} 수령!`,
      });
    });
  };

  const claimAll = () => {
    run({ type: 'claimAllAchievements' }, r => {
      if (r.result.type === 'claimAllAchievements') {
        const parts: string[] = [];
        if (r.result.gold > 0) parts.push(fmtGold(r.result.gold));
        const hatNames = r.result.hats.map(id => hatById(id)?.name ?? '모자');
        if (hatNames.length > 0) parts.push(hatNames.join(', '));
        if (parts.length > 0) {
          sendNotice(setToast, {
            kind: 'achievement.claimed',
            text: `업적 보상으로 ${josa(parts.join('와 '), '을/를')} 받았어요!`,
            toastText: '업적 보상 모두 수령 완료!',
          });
        }
      }
    });
  };

  const progressGroups = tab === 'progress' ? progressZoneGroups(game, incompleteOnly) : [];
  const bonusCards = tab === 'bonus' ? cumulativeBonusCards(game) : [];
  const bonusGroups = tab === 'bonus' ? [
    { key: 'global', title: '전역 누적 보너스', items: sortBonusDoneLast(bonusCards.filter(c => c.series.scope === 'global' && c.series.id !== 'bonus-max-artifact')) },
    { key: 'zone', title: '구역별 누적 보너스', items: sortBonusDoneLast(bonusCards.filter(c => c.series.scope === 'zone')) },
    { key: 'artifact', title: '유물 누적 보너스', items: sortBonusDoneLast(bonusCards.filter(c => c.series.id === 'bonus-max-artifact')) },
  ] : [];
  const cosmeticItems = tab === 'cosmetic' ? cosmeticCards(game, cosmeticFilter) : [];
  const filterStats = tab === 'cosmetic' ? cosmeticFilterStats(game) : null;
  const btn = (
    <Button variant="primary" size="sm" disabled={busy || !summary.canClaimAll} onClick={claimAll}>
      모두 받기
    </Button>
  );

  return (
    <Modal layer="stage" md height={560} mobileFixed onClose={onClose}>
      <ModalCard title="업적" onClose={onClose} fixed>
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <Inset className="flex flex-wrap items-center justify-between gap-2 min-h-10 px-3 py-1.5 shrink-0 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <span className="whitespace-nowrap">
                받은 업적 <b className="pf-accent">{fmtNum(summary.claimed)}/{fmtNum(summary.total)}</b>
              </span>
              <span className="whitespace-nowrap">
                받을 골드 <b className="pf-accent text-gold">{fmtGold(summary.gold)}</b>
              </span>
              <span className="whitespace-nowrap">
                받을 모자 <b className="pf-accent">{fmtNum(summary.hats)}개</b>
              </span>
            </div>
            {guest ? (
              <LockTip lines={GUEST_LOCK_DEFAULT_LINES}>{btn}</LockTip>
            ) : (
              <Tip wraps text="지금 받을 수 있는 업적이 없어요." onlyIf={() => !summary.canClaimAll}>{btn}</Tip>
            )}
          </Inset>

          <TabBar tabs={tabs} activeKey={tab} onSelect={setTab} />

          {tab === 'progress' && (
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
              <span className="text-xs text-text-dim">해역 일반 도감 15곳 (기초 및 숙련 30종)</span>
              <ToggleChip
                pressed={incompleteOnly}
                emphasis={incompleteOnly}
                onClick={() => setIncompleteOnly(v => !v)}
              >
                <PixelIcon glyph="check" size={10} />
                미완료만 보기
              </ToggleChip>
            </div>
          )}

          {tab === 'bonus' && (
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
              <span className="text-xs text-text-dim">달성한 단계는 수령 없이 즉시 적용돼요.</span>
              {onOpenStatsBonus && (
                <Button size="sm" type="button" onClick={onOpenStatsBonus}>
                  스탯 창 보너스 탭에서 전체 합계 확인
                </Button>
              )}
            </div>
          )}

          {tab === 'cosmetic' && filterStats && (
            <div className="flex flex-wrap gap-1.5 shrink-0 mobile:grid mobile:grid-cols-2">
              {COSMETIC_FILTERS.map(f => {
                const st = filterStats[f.key];
                const active = cosmeticFilter === f.key;
                return (
                  <ToggleChip
                    key={f.key}
                    pressed={active}
                    emphasis={active}
                    className="min-w-0 mobile:justify-center"
                    onClick={() => setCosmeticFilter(f.key)}
                  >
                    <span>{f.label}</span>
                    <span className="pf-accent text-2xs text-text-dim">({st.achieved}/{st.total})</span>
                    {st.claimable > 0 && <CountBadge tone="gold" count={st.claimable} />}
                  </ToggleChip>
                );
              })}
            </div>
          )}

          <div className={`${SCROLL_Y} flex-1 min-h-0`}>
            {tab === 'progress' && (
              progressGroups.length === 0 ? (
                <Inset tone="deep" className="p-6 text-center text-xs text-text-dim">
                  모든 진행 업적을 완료했어요.
                </Inset>
              ) : (
                <div className="flex flex-col gap-3">
                  {progressGroups.map(g => (
                    <div key={g.zone}>
                      <Subheading className="flex items-center justify-between mb-1.5">
                        <span>{g.zoneName}</span>
                        <span className="pf-accent text-2xs">{g.claimedCount}/{g.items.length}</span>
                      </Subheading>
                      <div className={CARD_GRID}>
                        {g.items.map(row => (
                          <AchievementCard key={row.def.id} row={row} game={game} guest={guest} busy={busy} onClaim={() => claimOne(row)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === 'bonus' && (
              <div className="flex flex-col gap-3">
                {bonusGroups.map(g => (
                  <div key={g.key}>
                    <Subheading className="flex items-center justify-between mb-1.5">
                      <span>{g.title}</span>
                      <span className="pf-accent text-2xs">{g.items.filter(x => x.allDone).length}/{g.items.length} 완결</span>
                    </Subheading>
                    <div className={CARD_GRID}>
                      {g.items.map(card => (
                        <CumulativeBonusCard key={card.series.id} card={card} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'cosmetic' && (
              <div className={CARD_GRID}>
                {cosmeticItems.map(item => (
                  item.kind === 'single' ? (
                    <AchievementCard
                      key={item.row.def.id}
                      row={item.row}
                      game={game}
                      guest={guest}
                      busy={busy}
                      onClaim={() => claimOne(item.row)}
                    />
                  ) : (
                    <NamedGroupCard
                      key={item.groupId}
                      card={item}
                      game={game}
                      guest={guest}
                      busy={busy}
                      onClaim={claimOne}
                    />
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      </ModalCard>
    </Modal>
  );
}
