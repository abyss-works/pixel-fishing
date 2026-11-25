// 흔적 카드 — 바다 HUD 오른쪽 열(접속·미끼 칩 위)에 뜨는 네임드 흔적. 자리와 폭은 HUD 배치가 정한다.
// 조우로 받은 도전권이 남아 있는 동안 남은 시간·추적 버튼을 보인다.
// 의뢰 구역 밖에서는 기본 테두리로 낮추고 구역 이름·남은 시간과 추적 조건을 카드 본문에 바로 보인다.
// 토벌을 마치면 수배판에서 보상을 받으라는 안내만 남긴다.
import { useBounty } from '../../../../features/bounty/service/useBounty';
import { selectTraceCard } from '../../../../features/bounty/model/trace';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import { useSpotState } from '../../../../features/travel/service/useSpotState';
import Button from '../../../ui/Button';
import PixelIcon from '../../../ui/PixelIcon';
import { fmtMinutes, josa } from '../../../ui/format';
import HudPanel from '../../../ui/hud/HudPanel';
import HudRows from '../../../ui/hud/HudRows';
import { STACK_OMIT_CLASS } from '../../../ui/hud/stackTier';

const CARD = 'w-full flex flex-col gap-1.5 px-2.5 py-2 text-xs';

function TraceHead({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-bold text-gold">
      <PixelIcon glyph="ticket" size={12} />{label}
    </span>
  );
}

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

  if (card.done) {
    const name = card.named.name;
    return (
      <HudPanel tone="gold" className={CARD} role="status" aria-label="토벌">
        <TraceHead label="토벌" />
        <span><b className="text-epic">{name}</b>{josa(name, '을/를').slice(name.length)} 토벌했어요. {card.zoneName}의 수배판에서 보상을 받아 주세요.</span>
      </HudPanel>
    );
  }
  if (!card.here) {
    return (
      <HudPanel className={CARD} role="status" aria-label="흔적">
        <span className="flex items-center gap-1.5">
          <PixelIcon glyph="ticket" size={12} className="text-gold" /><b>흔적</b>
          <span className="ml-auto text-text-dim">{card.zoneName}</span>
        </span>
        <HudRows rows={[{
          key: 'left',
          label: '남은 시간',
          value: fmtMinutes(card.leftMins),
        }]} />
        <span data-omittable className={`text-2xs text-text-dim ${STACK_OMIT_CLASS}`}>
          {card.zoneName}에서 추적할 수 있어요.
        </span>
      </HudPanel>
    );
  }
  return (
    <HudPanel tone="gold" className={CARD} role="status" aria-label="흔적">
      <TraceHead label="흔적" />
      <HudRows rows={[{ key: 'left', label: '남은 시간', value: fmtMinutes(card.leftMins) }]} />
      <Button size="sm" variant="primary" full onClick={() => onTrack(card.quest.id)}>추적</Button>
    </HudPanel>
  );
}
