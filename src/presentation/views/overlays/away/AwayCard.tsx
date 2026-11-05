import type { AwaySummary } from '../../../../game/rules/away';
import Button from '../../../ui/Button';
import CloseButton from '../../../ui/CloseButton';
import { fmtNum } from '../../../ui/format';
import HudPanel from '../../../ui/hud/HudPanel';
import HudRows from '../../../ui/hud/HudRows';
import { awayDuration, bagFullText } from './awayText';

// 방치 결과 알림 카드 — 돌아오면 HUD 오른쪽 열(알림 칸)에 뜨는 골드 테두리 노치 패널. 비운 시간을 크게,
// 잡은 물고기·명성·새 도감을 목록(이름 왼쪽, 값 오른쪽)으로, 가방이 찼으면 주황 한 줄을 보인다.
// 오른쪽 위 X로 닫고, 자세히는 결과 창을 연다.
export default function AwayCard({ report, onClose, onDetail }: {
  report: AwaySummary;
  onClose: () => void;
  onDetail: () => void;
}) {
  const bag = bagFullText(report);
  return (
    <HudPanel tone="gold" className="relative w-full flex flex-col gap-1.5 px-2.5 py-2 text-xs"
              role="status" aria-label="자리를 비운 사이">
      <CloseButton onClose={onClose} />
      <span className="text-text-dim">자리를 비운 사이</span>
      <span className="pf-accent text-gold text-lg leading-none">{awayDuration(report.awayMs)}</span>
      <HudRows rows={[
        { key: 'catches', label: '잡은 물고기', value: fmtNum(report.catches) },
        { key: 'fame', label: '명성', value: `+${fmtNum(report.fame)}` },
        { key: 'dex', label: '새 도감', value: fmtNum(report.newFish.length) },
      ]} />
      {bag && <span className="text-orange">{bag}</span>}
      <Button size="sm" variant="primary" full onClick={onDetail}>자세히</Button>
    </HudPanel>
  );
}
