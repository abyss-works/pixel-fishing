import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { selectRodLadder, selectRodUpgradePreview } from '../../../../features/gameplay/model/facility';
import CostBox from '../../../ui/CostBox';
import CostLine from '../../../ui/CostLine';
import GearSprite from '../../../ui/GearSprite';
import HeroHeader from '../../../ui/HeroHeader';
import PixelIcon from '../../../ui/PixelIcon';
import ProgressLadder from '../../../ui/ProgressLadder';
import Tip from '../../../ui/Tip';
import { fmtGold, fmtNum } from '../../../ui/format';
import FacilityCard from './FacilityCard';
import { CompareTable, ConfirmButton } from './facilityParts';

/** 입질 대기 구간 */
const bite = (s: { biteMin: number; biteMax: number }) => `${s.biteMin.toFixed(1)}~${s.biteMax.toFixed(1)}초`;

/** 초 단위 변화량 — 줄어드는 게 좋은 값(대기 시간)이라 음수를 그대로 보인다 */
const secDelta = (d: number): string | undefined =>
  Math.abs(d) < 0.05 ? undefined : `${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(1)}초`;

// 낚싯대 강화 (상한 없음). 왼쪽은 단계 목록(레벨, 입질 대기, 파워, 가격)이고 다음 단계가 확정 대상이다.
// 오른쪽은 다음 단계의 머리와 현재와 강화 후 비교다. 강화 규칙 설명은 비교 표 머리의 툴팁이다.
// 잔액과 강화 버튼의 자리는 FacilityCard가 폭에 따라 정한다.
export default function RodPanel({ game, onUpgrade, onClose, busy }: {
  game: GameState; onUpgrade: () => void; onClose: () => void; busy: boolean;
}) {
  const { cost, current, next, power, canUpgrade } = selectRodUpgradePreview(game);
  const steps = selectRodLadder(game).map(r => ({
    key: String(r.level), state: r.state,
    label: <span className="pf-accent">Lv.{r.level}</span>,
    subs: [<>입질 {bite(r.stats)}</>, <>파워 <span className="pf-accent">{fmtNum(r.power)}</span></>],
    trailing: r.state === 'done' ? <PixelIcon glyph="check" size={12} className="text-text-dim" />
      : r.state === 'current' ? <span className="text-2xs text-accent">지금</span>
      : <span className="pf-accent">{fmtGold(r.cost)}</span>,
  }));

  return (
    <FacilityCard title="낚싯대 강화" onClose={onClose}
      list={<ProgressLadder label="낚싯대 단계" steps={steps} />}
      summary={<CostBox><CostLine have={game.gold} delta={-cost} /></CostBox>}
      confirm={
        <ConfirmButton reason={canUpgrade.ok ? null : REJECT_TEXT[canUpgrade.reason]}
                       disabled={!canUpgrade.ok || busy} onClick={onUpgrade}>
          강화 (-{fmtGold(cost)})
        </ConfirmButton>
      }
      detail={<>
          <HeroHeader sprite={<GearSprite kind="rod" preset="hero" ariaLabel="낚싯대" />}
                       title={`Lv.${game.rod + 1}`}
                       tags={[`지금 Lv.${game.rod}`, '입질 단축', '파워 상승']} />
          <CompareTable
            heads={[`현재(Lv.${game.rod})`,
              <Tip key="next" text={<>강화에는 상한이 없어요.<br />레벨이 오를수록 오르는 폭은 줄어요.</>}>강화 후(Lv.{game.rod + 1})</Tip>]}
            rows={[
              { label: <Tip text="물고기가 미끼를 물기까지 기다리는 시간이에요.">입질 대기</Tip>,
                value: bite(current), next: bite(next), delta: secDelta(next.biteMax - current.biteMax) },
              { label: <Tip text={<>해역 요구 파워를 넘을수록 GOOD과 PERFECT 영역이 넓어져요.<br />해역별 충족은 스탯 창에서 볼 수 있어요.</>}>파워</Tip>,
                value: fmtNum(power.current), next: fmtNum(power.next), delta: `+${fmtNum(power.next - power.current)}` },
            ]} />
      </>} />
  );
}
