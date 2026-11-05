// 같은 바다 접속 표시 — 바다 HUD 오른쪽 열의 미니맵 위 칩 줄에 이 바다에 있는 다른 플레이어 수만 보인다.
// 누르면 접속 목록을 연다. 설명은 게임 툴팁으로 보인다. 아무도 없으면 그리지 않는다.
import { usePlayersIn } from '../../../../features/live/service/useLive';
import HudChip from '../../../ui/hud/HudChip';
import PixelIcon from '../../../ui/PixelIcon';
import Tip from '../../../ui/Tip';

export default function PresenceChip({ region, onOpen }: { region: string; onOpen: () => void }) {
  const count = usePlayersIn(region).length;
  if (count === 0) return null;
  return (
    <Tip wraps className="flex" text={<>이 바다의 플레이어 {count}명<br />누르면 목록을 열어요.</>}>
      <HudChip onClick={onOpen} aria-label={`이 바다의 플레이어 ${count}명, 목록 열기`}>
        <PixelIcon glyph="people" size={12} />
        <span className="pf-accent leading-none">{count}</span>
      </HudChip>
    </Tip>
  );
}
