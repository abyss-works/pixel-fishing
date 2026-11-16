import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { GameAction } from '../../../../game/rules/actions';
import type { AchievementTab } from '../../../../game/content/achievements';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import { when } from '../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import {
  ACHIEVEMENT_TABS, achievementRows, achievementSummary,
} from '../../../../features/achievement/model/achievements';
import type { AchievementRow } from '../../../../features/achievement/model/achievements';
import { josa } from '../../../ui/format';
import { fmtGold } from '../../../ui/format';
import { SCROLL_Y } from '../../../ui/scrollArea';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import TabBar from '../../../ui/TabBar';
import type { Notify } from '../../../ui/hud/messageFeed';
import { hatById } from '../../../../game/content/wardrobe';
import AchievementCard from './AchievementCard';

interface Props {
  game: GameState;
  /** 게스트 여부 — 게스트는 수령이 거절되므로 버튼은 잠긴다 */
  guest?: boolean;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}

// 업적 창 — 메뉴 줄의 업적을 눌러 여는 창. 진행, 수집, 네임드와 유물, 횟수 탭 넷으로 나누고
// 탭 안에서는 받을 수 있는 업적을 맨 위에, 진행 중을 그 아래, 받은 업적을 마지막에 둔다.
// 상단 요약 줄에는 받은 수와 받을 수 있는 골드·모자 합과 [모두 받기]를 고정해 둔다.
// 탭 본문은 카드 격자다. 열 수는 본문 폭과 카드 최소 폭으로 정하고, 좁으면 1열로 내려가며 가로 스크롤을 만들지 않는다.
// 받기는 카드 안 버튼이 서버 판정의 결과만 쓴다.
export default function AchievementsModal({ game, guest = false, dispatch, setToast, onClose }: Props) {
  const [tab, setTab] = useState<AchievementTab>('progress');
  const [busy, setBusy] = useState(false);
  const summary = achievementSummary(game, guest);
  const rows = achievementRows(game, tab);

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

  return (
    <Modal layer="stage" md height={560} mobileFixed onClose={onClose}>
      <ModalCard title="업적" onClose={onClose} fixed>
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <Inset className="flex items-center gap-3 h-10 px-3 shrink-0 text-xs">
            <span>받은 업적 <b className="pf-accent">{summary.claimed}/{summary.total}</b></span>
            <span className="pl-3 border-l border-line">받을 골드 <b className="pf-accent text-gold">{fmtGold(summary.gold)}</b></span>
            <span className="pl-3 border-l border-line">받을 모자 <b className="pf-accent">{summary.hats}개</b></span>
            <span className="ml-auto">
              <Button variant="primary" size="sm" disabled={busy || !summary.canClaimAll} onClick={claimAll}>모두 받기</Button>
            </span>
          </Inset>
          <TabBar tabs={ACHIEVEMENT_TABS} activeKey={tab} onSelect={setTab} />
          <div className={`${SCROLL_Y} flex-1 min-h-0`}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-2">
              {rows.map(row => (
                <AchievementCard key={row.def.id} row={row} game={game} guest={guest} busy={busy} onClaim={() => claimOne(row)} />
              ))}
            </div>
          </div>
        </div>
      </ModalCard>
    </Modal>
  );
}
