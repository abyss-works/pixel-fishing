// 지명수배 카드 — 2열 [좌 초상화 | 우 카드 통째(타이틀-본문-보상-버튼)].
// 우측 스택은 BountyCard의 수직 구조(마스트헤드·룰선·본문·룰선·보상·버튼)를 그대로 둔다.
import { namedById } from '../data/named.js';
import type { NamedFish } from '../data/named.js';
import { formDiscovered } from '../game/logic.js';
import type { Fish } from '../data/fish';
import type { GameState } from '../game/logic.js';
import type { BountyQuest } from '../data/bounties.js';
import Button from '../ui/Button';
import FishSprite from '../ui/FishSprite';

// 수배서 사진 — 레지스트리에서 Fish 껍데기를 만든다 (표시 전용, 저장 안 함).
// 가격 0은 찍지 않는다 — 카드에 가격을 그리지 않으므로 상관없다.
const namedFishOf = (n: NamedFish): Fish => ({
  id: n.id, name: n.name, spot: 'deep', rarity: 'legendary', price: 0,
  color: n.color, shape: n.shape, lore: n.lore,
  variant: { name: n.name, color: n.color, lore: n.lore },
});

export default function NamedCard({ game, quest, canAccept, busy, progress, onAccept, onDeliver }: {
  game: GameState; quest: BountyQuest; canAccept: boolean; busy: boolean;
  progress: number; onAccept: () => void; onDeliver: () => void;
}) {
  const n = quest.targetFish ? namedById(quest.targetFish) : undefined;
  const fish = n ? namedFishOf(n) : null;
  const found = quest.targetFish ? formDiscovered(game, quest.targetFish, 'normal') : false;
  const done = progress >= quest.count;
  return (
    <div className="border border-gold rounded-sm p-4 bg-surface min-h-96 h-full flex flex-col">
      <div className="grid grid-cols-2 grid-rows-1 gap-2 items-stretch flex-1">
        <span className="content-center">
          {fish && (
            <FishSprite fish={fish} preset="portrait" discovered={found}
                        ariaLabel={found && n ? n.name : '미확인 지명수배'} className="block mx-auto" />
          )}
        </span>
        <span className="text-center flex flex-col gap-2 text-sm">
          <b className="pf-accent text-gold text-lg">지명수배</b>
          <div className="border-b border-line" />
          <span className="flex-1 content-center">
            <b className="text-gold">{found && n ? n.name : '???'}</b><br />
            <span className="text-text-dim italic text-xs">
              {n ? n.lore : '수배서에만 이름이 돈다.'}
            </span>
          </span>
          <div className="border-b border-line" />
          <span className="pf-accent text-gold text-2xl">{quest.reward}G</span>
          {progress > 0 && <span className="text-text-dim text-xs">진행 {progress}/{quest.count}</span>}
          <span className="flex justify-center mt-auto">
            {done
              ? <Button size="sm" disabled={busy} onClick={onDeliver}>납품하기</Button>
              : <Button variant="primary" disabled={!canAccept || busy} onClick={onAccept}>수주하기</Button>}
          </span>
        </span>
      </div>
    </div>
  );
}
