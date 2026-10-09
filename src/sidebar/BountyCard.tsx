// 현상수배서 카드 — 상단 마스트헤드 · 중단 의뢰 내용 · 하단 보상.
// 수배판 3열과 동일한 구조다. 구조가 바뀌면 여기만 고친다.
// 디자인: 이중 골드 프레임 + 가운데 정렬 + Silkscreen 마스트헤드/보상 숫자.
// (DESIGN.md — 기억에 남는 건 프레임과 마스트헤드 하나뿐)
import { zoneById } from '../data/zones.js';
import type { BountyQuest } from '../data/bounties.js';
import Button from '../ui/Button';
import { RarityText } from '../ui/RarityTag';

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
    <div className="border border-gold rounded-sm p-4 text-center flex flex-col gap-2 text-sm bg-surface min-h-96 h-full outline outline-1 outline-offset-[3px] outline-gold/60">
      <b className={`pf-accent text-lg ${DIFF_HEAD[quest.difficulty]}`}>{DIFF_NAME[quest.difficulty]}</b>
      <div className="border-b border-line" />
      <span className="flex-1 content-center">
        {zoneById(quest.zone)?.shortName} <RarityText rarity={quest.grade!} /> 등급 어종 전달<br />
        <span className="text-text-dim">x {quest.count}</span>
      </span>
      <div className="border-b border-line" />
      <span className="pf-accent text-gold text-2xl">{quest.reward}G</span>
      {progress > 0 && <span className="text-text-dim text-xs">진행 {progress}/{quest.count}</span>}
      <span className="flex justify-center mt-auto">
        {done
          ? <Button size="sm" disabled={busy} onClick={onDeliver}>납품하기</Button>
          : <Button variant="primary" disabled={!canAccept || busy} onClick={onAccept}>수주하기</Button>}
      </span>
    </div>
  );
}
