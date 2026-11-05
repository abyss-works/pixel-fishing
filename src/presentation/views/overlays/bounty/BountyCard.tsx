// 일반 의뢰 카드 — 수배판 일반 의뢰 탭의 세 칸 중 하나. 위에서부터 난이도, 대상 등급, 마리 수, 보상이고
// 아래에 진행 막대와 버튼을 둔다. 진행 막대 자리는 수주 전에도 비워 두어 세 카드의 버튼 높이가 같다.
// 구역은 창의 고정 정보 줄이 보이므로 카드에 다시 쓰지 않는다.
import type { BountyQuest } from '../../../../game/content/bounties.js';
import { DIFFICULTY_NAME } from '../../../../features/bounty/model/panel';
import Button from '../../../ui/Button';
import Frame from '../../../ui/Frame';
import { RarityText } from '../../../ui/fish/RarityTag';
import { fmtGold, fmtNum } from '../../../ui/format';
import { AcceptButton } from './boardParts';

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
  const shown = Math.min(progress, quest.count);
  return (
    <Frame className="bg-surface-2 p-3 flex flex-col gap-2 h-full text-sm">
      <b className="text-xs text-text-dim">{DIFFICULTY_NAME[quest.difficulty as keyof typeof DIFFICULTY_NAME]}</b>
      <span><b><RarityText rarity={quest.grade!} /></b> 등급 어종</span>
      <span className="pf-accent text-xs">{fmtNum(quest.count)}마리</span>
      <span className="pf-accent text-gold text-xl">{fmtGold(quest.reward)}</span>
      <div className="mt-auto flex flex-col gap-1.5">
        {accepted ? (
          <div className="flex items-center gap-2 h-3.5">
            <span className="block flex-1 h-2 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]" role="meter"
                  aria-label="진행" aria-valuemin={0} aria-valuemax={quest.count} aria-valuenow={shown}>
              <span className="block h-full bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                    style={{ width: `${(shown / quest.count) * 100}%` }} />
            </span>
            <span className="pf-accent text-2xs">{shown}/{quest.count}</span>
          </div>
        ) : <div className="h-3.5" aria-hidden="true" />}
        {done
          ? <Button variant="primary" full disabled={busy} onClick={onDeliver}>납품</Button>
          : accepted
            ? <Button full disabled>진행 중</Button>
            : <AcceptButton disabled={!canAccept || busy} reason={reason} onClick={onAccept}
                            help="수주한 뒤에 잡은 물고기부터 세요. 물고기는 가방에 남아요." />}
      </div>
    </Frame>
  );
}
