// 일반 의뢰 카드 — 수배판 일반 의뢰 탭의 세 칸 중 하나. 위에서부터 난이도, 대상 등급, 마리 수, 보상이고
// 아래에 진행 막대와 버튼을 둔다. 진행 막대 자리는 수주 전에도 비워 두어 세 카드의 버튼 높이가 같다.
// 구역은 창의 고정 정보 줄이 보이므로 카드에 다시 쓰지 않는다.
import type { BountyQuest } from '../../../../game/content/bounties.js';
import { DIFFICULTY_NAME } from '../../../../features/bounty/model/panel';
import Button from '../../../ui/Button';
import Inset from '../../../ui/Inset';
import { cx } from '../../../ui/cx';
import { RarityText } from '../../../ui/fish/RarityTag';
import { fmtGold, fmtNum } from '../../../ui/format';
import { AcceptButton, ProgressMeter } from './boardParts';

export default function BountyCard({ quest, progress, accepted, canAccept, reason, busy, onAccept, onDeliver }: {
  quest: BountyQuest;
  progress: number;
  /** 수주 중 — 진행도가 0이어도 진행 중으로 보인다 */
  accepted: boolean;
  canAccept: boolean;
  /** 수주할 수 없는 이유 — 버튼의 툴팁으로 보인다 */
  reason: string | null;
  busy: boolean;
  onAccept: () => void;
  onDeliver: () => void;
}) {
  const done = progress >= quest.count;
  return (
    <Inset tone={done ? 'light' : 'base'} border={done ? 'gold' : 'line'}
           className={cx('p-3 flex flex-col gap-2 h-full text-sm', done && 'bg-[color-mix(in_oklab,var(--c-gold)_8%,var(--inset-light))]')}>
      <b className="text-xs text-text-dim">{DIFFICULTY_NAME[quest.difficulty as keyof typeof DIFFICULTY_NAME]}</b>
      <span><b><RarityText rarity={quest.grade!} /></b> 등급 어종</span>
      <span className="pf-accent text-xs">{fmtNum(quest.count)}마리</span>
      <span className="pf-accent text-gold text-xl">{fmtGold(quest.reward)}</span>
      <div className="mt-auto flex flex-col gap-1.5">
        {accepted ? (
          <ProgressMeter progress={progress} count={quest.count} />
        ) : <div className="h-3.5" aria-hidden="true" />}
        {done
          ? <Button variant="primary" full disabled={busy} onClick={onDeliver}>완료</Button>
          : accepted
            ? <Button full disabled>진행 중</Button>
            : <AcceptButton disabled={!canAccept || busy} reason={reason} onClick={onAccept} />}
      </div>
    </Inset>
  );
}
