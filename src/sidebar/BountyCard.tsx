// 현상금 일반 의뢰 카드 — 상단 난이도 · 중단 의뢰 내용 · 하단 보상.
// 수배판 3열과 동일한 구조다. 구조가 바뀌면 여기만 고친다.
import { RARITY } from '../data/rarity.js';
import type { BountyQuest } from '../data/bounties.js';
import Button from '../ui/Button';

const DIFF_HEAD: Record<string, string> = {
  easy: 'text-text-dim', normal: 'text-accent', hard: 'text-orange',
};
const DIFF_NAME: Record<string, string> = {
  easy: '쉬움', normal: '보통', hard: '어려움',
};

export default function BountyCard({ quest, progress, canAccept, busy, onAccept, onDeliver }: {
  quest: BountyQuest;
  progress: number;
  canAccept: boolean;
  busy: boolean;
  onAccept: () => void;
  onDeliver: () => void;
}) {
  const done = progress >= quest.count;
  return (
    <div className="flex flex-col gap-1 text-sm border border-line rounded-sm p-2">
      <b className={DIFF_HEAD[quest.difficulty]}>{DIFF_NAME[quest.difficulty]}</b>
      <span>{RARITY[quest.grade!].name} 포획 및 전달</span>
      <span className="text-text-dim text-xs">×{quest.count}</span>
      <span className="pf-accent text-gold">{quest.reward}G</span>
      {progress > 0 && <span className="text-text-dim text-xs">진행 {progress}/{quest.count}</span>}
      {done
        ? <Button size="sm" disabled={busy} onClick={onDeliver}>납품하기</Button>
        : <Button size="sm" disabled={!canAccept || busy} onClick={onAccept}>수주하기</Button>}
    </div>
  );
}
