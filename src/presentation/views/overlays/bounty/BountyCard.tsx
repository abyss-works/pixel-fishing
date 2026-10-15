// 일반 의뢰 수배서 카드 — 상단 마스트헤드 · 중단 의뢰 내용 · 하단 보상.
// 수배판 3열과 동일한 구조다. 구조가 바뀌면 여기만 고친다.
// 디자인: 이중 골드 프레임 + 가운데 정렬 + Silkscreen 마스트헤드/보상 숫자.
// (디자인 원칙 — 기억에 남는 건 프레임과 마스트헤드 하나뿐)
import { zoneById } from '../../../../game/content/zones.js';
import type { BountyQuest } from '../../../../game/content/bounties.js';
import { DIFFICULTY_NAME } from '../../../../features/bounty/model/panel';
import Button from '../../../ui/Button';
import { RarityText } from '../../../ui/fish/RarityTag';

const DIFF_HEAD: Record<string, string> = {
  easy: 'text-text-dim', normal: 'text-accent', hard: 'text-orange',
};


export default function BountyCard({ quest, progress, accepted, canAccept, busy, onAccept, onDeliver }: {
  quest: BountyQuest;
  progress: number;
  /** 수주 중 — 진행도가 0이어도 진행 중으로 보인다 */
  accepted: boolean;
  canAccept: boolean;
  busy: boolean;
  onAccept: () => void;
  onDeliver: () => void;
}) {
  const done = progress >= quest.count;
  return (
    <div className="border border-gold rounded-sm p-4 text-center flex flex-col gap-2 text-sm bg-surface min-h-96 h-full">
      <b className={`pf-accent text-lg ${DIFF_HEAD[quest.difficulty]}`}>{DIFFICULTY_NAME[quest.difficulty as keyof typeof DIFFICULTY_NAME]}</b>
      <div className="border-b border-line" />
      <span className="flex-1 content-center">
        {zoneById(quest.zone)?.shortName} <RarityText rarity={quest.grade!} /> 등급 어종 포획<br />
        <span className="text-text-dim">x {quest.count}</span>
      </span>
      <div className="border-b border-line" />
      <span className="pf-accent text-gold text-2xl">{quest.reward}G</span>
      {accepted && (
        <span className="text-accent text-xs">진행 중 · <span className="pf-accent">{Math.min(progress, quest.count)}/{quest.count}</span></span>
      )}
      <span className="flex justify-center mt-auto">
        {done
          ? <Button size="sm" disabled={busy} onClick={onDeliver}>납품하기</Button>
          : accepted
            ? <Button full disabled>진행 중</Button>
            : <Button variant="primary" full disabled={!canAccept || busy} onClick={onAccept}>수주하기</Button>}
      </span>
    </div>
  );
}
