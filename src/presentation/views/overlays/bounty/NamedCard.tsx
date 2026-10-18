// 네임드 토벌 카드 — 2열 [좌 초상화+이름 | 우 카드 통째(수배서 본문-보상-버튼)].
// 우측 스택은 BountyCard의 수직 구조(마스트헤드·룰선·본문·룰선·보상·버튼)를 그대로 둔다.
// 본문은 도감 로어가 아니라 수배서 전용 본문(named.poster)이다.
import type { GameState } from '../../../../game/rules/logic.js';
import type { BountyQuest } from '../../../../game/content/bounties.js';
import { selectNamedBountyCardData } from '../../../../features/bounty/model/panel';
import Button from '../../../ui/Button';
import FishSprite from '../../../ui/fish/FishSprite';
import { fmtGold, fmtMinutes } from '../../../ui/format';

export default function NamedCard({ game, quest, canAccept, busy, progress, accepted, ticketMins, onAccept, onDeliver }: {
  game: GameState; quest: BountyQuest; canAccept: boolean; busy: boolean;
  progress: number; accepted: boolean;
  /** 흔적(도전권)이 남아 있으면 남은 분 — 도전은 바다에서 치르므로 여기서는 상태만 보인다 */
  ticketMins: number | null; onAccept: () => void; onDeliver: () => void;
}) {
  const { name, poster, fish, found, done } = selectNamedBountyCardData(game, quest, progress);
  return (
    <div className="border border-gold rounded-sm p-4 bg-surface min-h-96 h-full flex flex-col">
      <div className="grid grid-cols-2 grid-rows-1 gap-2 items-stretch flex-1">
        <span className="content-center">
          {fish && (
            <FishSprite fish={fish} preset="portrait" discovered={found} animate={found}
                        ariaLabel={found && name ? name : '미확인 네임드'} className="block mx-auto" />
          )}
          <b className="block mt-1 text-gold text-center">{found && name ? name : '???'}</b>
        </span>
        <span className="text-center flex flex-col gap-2 text-sm border-l border-line pl-2">
          <b className="pf-accent text-gold text-lg">네임드 토벌</b>
          <div className="border-b border-line" />
          <span className="flex-1 content-center">
            <span className="text-text-dim italic text-xs">
              {poster}
            </span>
          </span>
          <div className="border-b border-line" />
      <span className="pf-accent text-gold text-2xl">{fmtGold(quest.reward)}</span>
      {accepted && !done && ticketMins === null && (
        <span className="text-accent text-xs">진행 중이에요. 이 구역에서 낚시하다 마주치면 흔적이 남아요.</span>
      )}
      {!done && ticketMins !== null && (
        <span className="text-accent text-xs">흔적이 남아 있어요. 바다에서 추적해 보세요. 남은 시간 {fmtMinutes(ticketMins)}</span>
      )}
          <span className="flex justify-center mt-auto">
            {done
              ? <Button size="sm" disabled={busy} onClick={onDeliver}>보상 수령</Button>
              : accepted
                ? <Button full disabled>진행 중</Button>
                : <Button variant="primary" full disabled={!canAccept || busy} onClick={onAccept}>수주</Button>}
          </span>
        </span>
      </div>
    </div>
  );
}
