import { AUTO_ENERGY_BOAT } from '../../../../game/content/cooking';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { selectBoatLadder, selectBoatPurchasePreview } from '../../../../features/gameplay/model/facility';
import BoatSprite from '../../../ui/BoatSprite';
import CostBox from '../../../ui/CostBox';
import CostLine from '../../../ui/CostLine';
import HeroHeader from '../../../ui/HeroHeader';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import ProgressLadder from '../../../ui/ProgressLadder';
import Tip from '../../../ui/Tip';
import TwoColumn from '../../../ui/TwoColumn';
import { fmtGold, fmtNum } from '../../../ui/format';
import FacilityCard from './FacilityCard';
import { CompareTable, ConfirmButton } from './facilityParts';

const AUTO_ENERGY_NOTE = '가방이 가득 차면 놓아줄 물고기 가운데 해역별 기운 대상으로 고른 해역의 물고기를 생명의 기운으로 바꿔요.';

// 조선소 — 배 구매(골드 차감, 명성 하한 검증). 왼쪽은 배 목록(그림, 이름, 속도, 가방)이고 오른쪽 끝에
// 탄 배는 체크, 지금 배는 "타는 중", 다음 배는 가격, 그 뒤 배는 잠금과 필요 명성을 둔다.
// 오른쪽은 다음 배의 머리와 현재와 구매 후 비교다. 잔액과 명성, 구매 버튼의 자리는 FacilityCard가 폭에 따라 정한다.
export default function BoatPanel({ game, onBuy, onClose, busy }: {
  game: GameState; onBuy: () => void; onClose: () => void; busy: boolean;
}) {
  const preview = selectBoatPurchasePreview(game);
  const steps = selectBoatLadder(game).map(({ boat: b, state }) => ({
    key: String(b.tier), state,
    leading: <BoatSprite tier={b.tier} preset="row" ariaLabel={b.name} />,
    label: b.name,
    subs: [<>속도 <span className="pf-accent">{fmtNum(b.speed)}</span></>, <>가방 <span className="pf-accent">{fmtNum(b.bagCap)}</span></>],
    trailing: state === 'done' ? <PixelIcon glyph="check" size={12} className="text-text-dim" />
      : state === 'current' ? <span className="text-2xs text-accent">타는 중</span>
      : state === 'next' || b.fameReq === 0 ? <span className="pf-accent">{fmtGold(b.price)}</span>
      : <><PixelIcon glyph="lock" size={12} /><span className="pf-accent">명성 {fmtNum(b.fameReq)}</span></>,
  }));
  const ladder = <ProgressLadder label="배 목록" steps={steps} />;

  if (preview.kind === 'max') {
    return (
      <ModalCard title="조선소" onClose={onClose}>
        <TwoColumn>
          {ladder}
          <div className="flex flex-col gap-3">
            <Note className="my-0">이미 가장 좋은 배({preview.boatName})를 가지고 있어요.<br />모든 해역에 나갈 수 있어요.</Note>
            {game.boat >= AUTO_ENERGY_BOAT && <Note size="xs" className="my-0">{AUTO_ENERGY_NOTE}</Note>}
          </div>
        </TwoColumn>
      </ModalCard>
    );
  }
  const { next, openedSpot, currentName, currentSpeed, currentBagCap, check } = preview;

  return (
    <FacilityCard title="조선소" onClose={onClose}
      list={ladder}
      summary={
        <CostBox>
          <CostLine have={game.gold} delta={-next.price}
                    requirement={{
                      label: <Tip text={'명성은 줄지 않아요.\n이만큼 있어야 살 수 있어요.'}>명성</Tip>,
                      need: next.fameReq, have: game.fame,
                    }} />
        </CostBox>
      }
      confirm={
        <ConfirmButton reason={check.ok ? null : REJECT_TEXT[check.reason]} disabled={!check.ok || busy} onClick={onBuy}>
          구매 (-{fmtGold(next.price)})
        </ConfirmButton>
      }
      detail={<>
          <HeroHeader sprite={<BoatSprite tier={next.tier} preset="hero" ariaLabel={next.name} />}
                       title={next.name}
                       tags={[
                         <><span className="pf-accent">{next.tier}</span>단계</>,
                         ...(openedSpot ? [`${openedSpot.name} 해금`] : []),
                         ...(next.tier === 1 ? ['대양 진입'] : []),
                       ]} />
          <CompareTable
            heads={[currentName ? `현재(${currentName})` : '현재', `구매 후(${next.name})`]}
            rows={[
              { label: '항해 속도', value: currentSpeed === null ? '도보' : fmtNum(currentSpeed), next: fmtNum(next.speed),
                delta: currentSpeed === null ? undefined : `+${fmtNum(next.speed - currentSpeed)}` },
              { label: '가방 상한', value: `${fmtNum(currentBagCap)}마리`, next: `${fmtNum(next.bagCap)}마리`,
                delta: `+${fmtNum(next.bagCap - currentBagCap)}` },
              { label: '새 해역', next: openedSpot ? openedSpot.name : next.tier === 1 ? '태평양' : '없음' },
            ]} />
          {next.tier === AUTO_ENERGY_BOAT && <Note size="xs" className="my-0">{AUTO_ENERGY_NOTE}</Note>}
      </>} />
  );
}
