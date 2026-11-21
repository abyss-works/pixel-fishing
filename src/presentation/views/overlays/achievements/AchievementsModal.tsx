import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { GameAction } from '../../../../game/rules/actions';
import type { AchievementTab } from '../../../../game/content/achievements';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import { when } from '../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import {
  ACHIEVEMENT_TABS,
  COSMETIC_FILTERS,
  achievementRows,
  achievementSummary,
  activeBonusChips,
  cosmeticCards,
  cumulativeBonusCards,
  tabClaimableCount,
} from '../../../../features/achievement/model/achievements';
import type { AchievementRow, CosmeticFilter } from '../../../../features/achievement/model/achievements';
import { fmtGold, josa } from '../../../ui/format';
import { SCROLL_Y } from '../../../ui/scrollArea';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import PillButton from '../../../ui/PillButton';
import TabBar from '../../../ui/TabBar';
import Tip, { TipList } from '../../../ui/Tip';
import type { Notify } from '../../../ui/hud/messageFeed';
import { hatById } from '../../../../game/content/wardrobe';
import AchievementCard, { CumulativeBonusCard, NamedGroupCard } from './AchievementCard';

interface Props {
  game: GameState;
  /** 게스트 여부 — 게스트는 수령이 거절되므로 버튼은 잠긴다 */
  guest?: boolean;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}

// 업적 창 — 메뉴 줄의 업적을 눌러 여는 창. 진행, 누적 보너스, 치장 탭 셋으로 나눈다.
// 상단 요약 줄에는 진행·치장 받은 수, 받을 골드, 받을 모자 수, [모두 받기]를 고정하고,
// 그 아래 적용 중인 누적 보너스 칩 바를 두어 호버·탭 툴팁으로 출처별 세부 내역을 보인다.
// 탭 본문은 카드 격자다. 열 수는 본문 폭과 카드 최소 폭으로 정하고, 좁으면 1열로 내려가며 가로 스크롤을 만들지 않는다.
export default function AchievementsModal({ game, guest = false, dispatch, setToast, onClose }: Props) {
  const [tab, setTab] = useState<AchievementTab>('progress');
  const [cosmeticFilter, setCosmeticFilter] = useState<CosmeticFilter>('all');
  const [busy, setBusy] = useState(false);

  const summary = achievementSummary(game, guest);
  const chips = activeBonusChips(game);
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
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error], 'warn');
    });
  };

  const claimOne = (row: AchievementRow) => {
    run({ type: 'claimAchievement', id: row.def.id }, () => {
      const reward = row.def.reward.kind === 'gold'
        ? `${fmtGold(row.def.reward.gold)}`
        : `${josa(hatById(row.def.reward.hatId)?.name ?? '모자', '을/를')}`;
      setToast(`“${row.def.name}” 업적 보상으로 ${reward} 받았어요.`, 'gold');
    });
  };

  const claimAll = () => {
    run({ type: 'claimAllAchievements' }, r => {
      if (r.result.type === 'claimAllAchievements') {
        const parts: string[] = [];
        if (r.result.gold > 0) parts.push(fmtGold(r.result.gold));
        const hatNames = r.result.hats.map(id => hatById(id)?.name ?? '모자');
        if (hatNames.length > 0) parts.push(josa(hatNames.join(', '), '을/를'));
        setToast(`업적 보상으로 ${parts.join('와 ')} 받았어요.`, 'gold');
      }
    });
  };

  const progressRows = tab === 'progress' ? achievementRows(game, 'progress') : [];
  const bonusCards = tab === 'bonus' ? cumulativeBonusCards(game) : [];
  const cosmeticItems = tab === 'cosmetic' ? cosmeticCards(game, cosmeticFilter) : [];

  return (
    <Modal layer="stage" md height={560} mobileFixed onClose={onClose}>
      <ModalCard title="업적" onClose={onClose} fixed>
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <Inset className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-10 px-3 py-1.5 shrink-0 text-xs">
            <span>받은 업적 <b className="pf-accent">{summary.claimed}/{summary.total}</b></span>
            <span className="pl-3 border-l border-line">받을 골드 <b className="pf-accent text-gold">{fmtGold(summary.gold)}</b></span>
            <span className="pl-3 border-l border-line">받을 모자 <b className="pf-accent">{summary.hats}개</b></span>
            <span className="ml-auto">
              <Button variant="primary" size="sm" disabled={busy || !summary.canClaimAll} onClick={claimAll}>모두 받기</Button>
            </span>
          </Inset>

          <Inset className="flex flex-col gap-1 px-3 py-1.5 shrink-0 text-2xs">
            <div className="flex items-center justify-between gap-2 text-text-dim">
              <span>적용 중인 누적 보너스</span>
              {chips.length === 0 && <span>조건 단계에 닿으면 자동으로 적용돼요.</span>}
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map(chip => (
                  <Tip
                    key={chip.id}
                    text={(
                      <div className="flex flex-col gap-1">
                        <TipList rows={chip.rows.map(([label, value]) => ({ label, value }))} />
                        <span className="text-2xs text-text-dim">{chip.foot}</span>
                      </div>
                    )}
                  >
                    <span className="inline-flex items-center gap-1 border border-line bg-surface-2 px-1.5 py-0.5 text-2xs">
                      <span>{chip.label}</span>
                      <b className="text-ok">{chip.valueText}</b>
                    </span>
                  </Tip>
                ))}
              </div>
            )}
          </Inset>

          <TabBar tabs={tabs} activeKey={tab} onSelect={setTab} />

          <div className={`${SCROLL_Y} flex-1 min-h-0`}>
            {tab === 'progress' && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-2">
                {progressRows.map(row => (
                  <AchievementCard key={row.def.id} row={row} game={game} guest={guest} busy={busy} onClaim={() => claimOne(row)} />
                ))}
              </div>
            )}

            {tab === 'bonus' && (
              <div className="flex flex-col gap-2">
                <p className="text-2xs text-accent">조건 단계에 닿으면 받기를 누르지 않아도 보너스가 바로 적용돼요.</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-2">
                  {bonusCards.map(card => (
                    <CumulativeBonusCard key={card.series.id} card={card} />
                  ))}
                </div>
              </div>
            )}

            {tab === 'cosmetic' && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1">
                  {COSMETIC_FILTERS.map(f => (
                    <PillButton
                      key={f.key}
                      type="button"
                      active={cosmeticFilter === f.key}
                      onClick={() => setCosmeticFilter(f.key)}
                    >
                      {f.label}
                    </PillButton>
                  ))}
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-2">
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
              </div>
            )}
          </div>
        </div>
      </ModalCard>
    </Modal>
  );
}
