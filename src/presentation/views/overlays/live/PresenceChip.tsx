// 같은 바다 접속 표시 — 바다 HUD 오른쪽 열에 이 바다에 있는 다른 플레이어 수와 이름 몇 개를 보인다.
// 아무도 없으면 그리지 않는다.
import { usePlayersIn } from '../../../../features/live/service/useLive';

const SHOWN = 3;

export default function PresenceChip({ region }: { region: string }) {
  const names = usePlayersIn(region);
  if (names.length === 0) return null;
  const more = names.length > SHOWN ? ` 외 ${names.length - SHOWN}명` : '';
  return (
    <div className="w-full px-2.5 py-1.5 rounded-sm border border-line pf-glass text-xs" role="status" aria-label="같은 바다">
      <span className="text-text-dim">이 바다에 {names.length}명</span>
      <span> · {names.slice(0, SHOWN).join(', ')}{more}</span>
    </div>
  );
}
