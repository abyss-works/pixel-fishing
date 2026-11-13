import type { AwaySummary } from '../../../../game/rules/away';
import Button from '../../../ui/Button';
import CloseButton from '../../../ui/CloseButton';
import { fmtNum } from '../../../ui/format';
import HudPanel from '../../../ui/hud/HudPanel';
import HudRows from '../../../ui/hud/HudRows';
import { STACK_OMIT_CLASS } from '../../../ui/hud/stackTier';
import Tip, { TipList } from '../../../ui/Tip';
import { useOmitted } from '../../../ui/useOmitted';
import { awayDuration, bagFullText } from './awayText';

// 방치 결과 알림 카드 — 돌아오면 HUD 오른쪽 열(알림 칸)에 뜨는 골드 테두리 노치 패널. 비운 시간을 크게,
// 잡은 물고기·명성·새 도감을 목록(이름 왼쪽, 값 오른쪽)으로, 가방이 찼으면 주황 한 줄을 보인다.
// 오른쪽 위 X로 닫고, 자세히는 결과 창을 연다.
// 새 도감 줄과 가방 안내 줄은 렌더링 역할이 생략이다. 쌓기 단계(stackTier)에서는 숨기고 카드에 마우스를 올리거나 포커스하면 툴팁으로 보인다.
export default function AwayCard({ report, onClose, onDetail }: {
  report: AwaySummary;
  onClose: () => void;
  onDetail: () => void;
}) {
  const bag = bagFullText(report);
  const { ref: dexRef, isOmitted } = useOmitted<HTMLLIElement>();
  const dex = fmtNum(report.newFish.length);
  return (
    <Tip wraps plain onlyIf={isOmitted} className="block w-full"
         text={<TipList rows={[{ label: '새 도감', value: dex }]} note={bag ?? undefined} />}>
      <HudPanel tone="gold" className="relative w-full flex flex-col gap-1.5 px-2.5 py-2 text-xs"
                role="status" aria-label="자리를 비운 사이">
        <CloseButton onClose={onClose} />
        <span className="text-text-dim">자리를 비운 사이</span>
        <span className="pf-accent text-gold text-lg leading-none">{awayDuration(report.awayMs)}</span>
        <HudRows rows={[
          { key: 'catches', label: '잡은 물고기', value: fmtNum(report.catches) },
          { key: 'fame', label: '명성', value: `+${fmtNum(report.fame)}` },
          { key: 'dex', label: '새 도감', value: dex, omittable: true, omitRef: dexRef },
        ]} />
        {bag && <span data-omittable className={`text-orange ${STACK_OMIT_CLASS}`}>{bag}</span>}
        <Button size="sm" variant="primary" full onClick={onDetail}>자세히</Button>
      </HudPanel>
    </Tip>
  );
}
