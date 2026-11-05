import type { AwaySummary } from '../../../../game/rules/away';
import Button from '../../../ui/Button';
import { fmtNum } from '../../../ui/format';
import { awayDuration, bagFullText } from './awayText';

// 방치 결과 알림 카드 — 돌아오면 HUD 오른쪽 열(알림 칸)에 뜬다. 비운 시간을 크게, 잡은 수·명성·새 도감을 한 줄로,
// 가방이 찼으면 주황 한 줄을 보인다. 자세히는 결과 창을 연다.
export default function AwayCard({ report, onClose, onDetail }: {
  report: AwaySummary;
  onClose: () => void;
  onDetail: () => void;
}) {
  const bag = bagFullText(report);
  return (
    <div className="w-full flex flex-col gap-1 px-2.5 py-1.5 rounded-sm border border-gold/60 pf-glass text-xs"
         role="status" aria-label="자리를 비운 사이">
      <span className="text-text-dim">자리를 비운 사이</span>
      <span className="pf-accent text-gold text-xl leading-none">{awayDuration(report.awayMs)}</span>
      <span className="flex flex-wrap gap-x-2.5">
        <span>잡음 <b>{fmtNum(report.catches)}</b></span>
        <span>명성 <b>+{fmtNum(report.fame)}</b></span>
        <span>새 도감 <b>{fmtNum(report.newFish.length)}</b></span>
      </span>
      {bag && <span className="text-orange">{bag}</span>}
      <span className="flex justify-end gap-1.5 mt-0.5">
        <Button size="sm" onClick={onClose}>닫기</Button>
        <Button size="sm" variant="primary" onClick={onDetail}>자세히</Button>
      </span>
    </div>
  );
}
