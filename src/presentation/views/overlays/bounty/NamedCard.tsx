// 네임드 토벌 카드 — 수배판 네임드 토벌 탭의 카드 한 장. 머리에 대상 이름과 (흔적이 있으면) 도전권 남은 시간을 두고,
// 본문은 나타나는 곳, 진행, 보상, 교환 재료의 줄 목록, 맨 아래에 버튼이다.
// 수배서 문구(named.poster)는 이름의 툴팁이다. 도전은 바다에서 치르므로 여기서는 상태만 보인다.
import type { GameState } from '../../../../game/rules/logic.js';
import type { BountyQuest } from '../../../../game/content/bounties.js';
import { selectNamedBountyCardData } from '../../../../features/bounty/model/panel';
import Button from '../../../ui/Button';
import Frame from '../../../ui/Frame';
import Tip from '../../../ui/Tip';
import { fmtGold } from '../../../ui/format';
import { AcceptButton, BoardRows, NamedCardHead } from './boardParts';

export default function NamedCard({ game, quest, canAccept, reason, busy, progress, accepted, ticketMins, materialName, onAccept, onDeliver }: {
  game: GameState; quest: BountyQuest; canAccept: boolean;
  /** 수주할 수 없는 이유 — 버튼의 툴팁으로 보인다 */
  reason: string | null;
  busy: boolean;
  progress: number; accepted: boolean;
  /** 흔적이 남아 있으면 남은 분 */
  ticketMins: number | null;
  /** 토벌 보상으로 받는 교환 재료 이름 */
  materialName: string | null;
  onAccept: () => void; onDeliver: () => void;
}) {
  const { name, poster, found, done, haunt, reward } = selectNamedBountyCardData(game, quest, progress);
  return (
    <Frame className="bg-surface-2 p-3 flex flex-col gap-2 flex-1 min-h-0">
      <NamedCardHead title={found && name ? name : '???'} titleTip={poster} traceMins={!done ? ticketMins : null} />
      <BoardRows rows={[
        { key: 'haunt', label: '나타나는 곳', value: haunt },
        { key: 'progress', label: <Tip text={`${haunt}에서 낚시하면 아주 드물게 마주쳐요.`}>진행</Tip>,
          value: <span className="pf-accent">{Math.min(progress, quest.count)}/{quest.count}</span> },
        { key: 'reward', label: '보상', value: <span className="pf-accent text-gold">{fmtGold(reward)}</span> },
        ...(materialName ? [{ key: 'material', label: '교환 재료', value: materialName }] : []),
      ]} />
      <div className="mt-auto">
        {done
          ? <Button variant="primary" full disabled={busy} onClick={onDeliver}>보상 받기</Button>
          : accepted
            ? <Button full disabled>진행 중</Button>
            : <AcceptButton disabled={!canAccept || busy} reason={reason} onClick={onAccept} />}
      </div>
    </Frame>
  );
}
