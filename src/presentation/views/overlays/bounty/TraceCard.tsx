// 흔적 카드 — 바다 HUD 오른쪽 열(미끼 칩 위)에 뜨는 네임드 흔적. 자리와 폭은 HUD 배치가 정한다.
// 조우로 받은 도전권이 남아 있는 동안 흔적 문장·남은 시간·추적 버튼을 보인다.
// 의뢰 구역 밖에서는 한 줄로 줄이고, 토벌을 마치면 수배판에서 보상을 받으라는 안내만 남긴다.
// 깜빡임·흔들림 없이 낮은 채도의 골드 테두리로만 "다른 알림과 다르다"를 말한다.
import { useBounty } from '../../../../features/bounty/service/useBounty';
import { selectTraceCard } from '../../../../features/bounty/model/trace';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import { useSpotState } from '../../../../features/travel/service/useSpotState';
import Button from '../../../ui/Button';
import PixelIcon from '../../../ui/PixelIcon';
import { cx } from '../../../ui/cx';
import { fmtMinutes, josa } from '../../../ui/format';

export default function TraceCard({ onTrack }: {
  /** 추적 — 그 의뢰의 조우 창을 연다 */
  onTrack: (questId: string) => void;
}) {
  const { snap } = useBounty();
  const { zone } = useSpotState();
  // 게임 시계(10초 주기)를 그대로 쓴다 — 분 단위 표시라 충분하고, 렌더 중 Date.now를 부르지 않는다
  const nowMs = Date.parse(useNow());

  const card = selectTraceCard(snap, zone, nowMs);
  if (!card) return null;

  const frame = cx('w-full flex flex-col gap-1 px-2.5 py-1.5 rounded-sm border border-gold/60',
    'pf-glass text-xs');

  if (card.done) {
    return (
      <div className={frame} role="status" aria-label="토벌">
        <span className="pf-accent text-gold text-sm leading-none flex items-center gap-1">
          <PixelIcon glyph="ticket" size={11} /> 토벌
        </span>
        <span>{josa(card.named.name, '을/를')} 토벌했어요! {card.zoneName}의 수배판에서 보상 받기를 눌러 주세요.</span>
      </div>
    );
  }
  if (!card.here) {
    return (
      <div className={frame} role="status" aria-label="흔적">
        <span className="text-text-dim">흔적이 {card.zoneName}에 남아 있어요. 그 구역에 가면 추적할 수 있어요. 남은 시간 {fmtMinutes(card.leftMins)}</span>
      </div>
    );
  }
  return (
    <div className={frame} role="status" aria-label="흔적">
      <span className="pf-accent text-gold text-sm leading-none flex items-center gap-1">
        <PixelIcon glyph="ticket" size={11} /> 흔적
      </span>
      <span className="italic">{card.named.trace}</span>
      <span className="text-text-dim">남은 시간 {fmtMinutes(card.leftMins)}</span>
      <Button size="sm" variant="primary" full onClick={() => onTrack(card.quest.id)}>추적</Button>
    </div>
  );
}
