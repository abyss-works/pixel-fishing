import { useGuild } from '../../../../features/guild/service/useGuild';
import Frame from '../../../ui/Frame';
import PixelIcon from '../../../ui/PixelIcon';

// 길드 버튼 — 게임 영역 오른쪽 위, 친구 버튼 왼쪽.
// 길드는 계정 유저만 쓴다. 게스트와 로컬 모드에서는 그리지 않는다.
export default function GuildButton({ account, onOpen }: { account: string | null; onOpen: () => void }) {
  const { available } = useGuild(account !== null);
  if (!available) return null;
  return (
    <Frame as="button" type="button" onClick={onOpen} aria-label="길드" title="길드"
           className="absolute right-29 top-3 z-(--z-overlay) p-2 cursor-pointer text-text-dim hover:text-gold">
      <PixelIcon glyph="flag" size={20} />
    </Frame>
  );
}
