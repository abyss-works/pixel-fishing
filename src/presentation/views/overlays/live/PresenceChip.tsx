// 같은 바다 접속 표시 — 바다 HUD 오른쪽 열에 이 바다에 있는 다른 플레이어 수만 보인다. 누르면 접속 목록을 연다.
// 아무도 없으면 그리지 않는다.
import { usePlayersIn } from '../../../../features/live/service/useLive';
import PillButton from '../../../ui/PillButton';
import PixelIcon from '../../../ui/PixelIcon';

export default function PresenceChip({ region, onOpen }: { region: string; onOpen: () => void }) {
  const count = usePlayersIn(region).length;
  if (count === 0) return null;
  return (
    <PillButton className="pf-glass self-end" onClick={onOpen} aria-label={`이 바다의 플레이어 ${count}명, 목록 열기`}
                title="이 바다의 플레이어">
      <PixelIcon glyph="people" size={12} />
      {count}명
    </PillButton>
  );
}
