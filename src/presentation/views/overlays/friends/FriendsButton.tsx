import { useFriends } from '../../../../features/friends/service/useFriends';
import Frame from '../../../ui/Frame';
import { cx } from '../../../ui/cx';
import PixelIcon from '../../../ui/PixelIcon';

// 친구 버튼 — 게임 영역 오른쪽 위, 우편함 왼쪽. 받은 친구 요청 수를 붙인다.
// 친구는 계정 유저만 쓴다. 게스트와 로컬 모드에서는 그리지 않는다.
export default function FriendsButton({ account, onOpen }: { account: string | null; onOpen: () => void }) {
  const { groups, offline } = useFriends(account !== null);
  if (account === null || offline) return null;
  const incoming = groups?.incoming.length ?? 0;
  return (
    <Frame as="button" type="button" onClick={onOpen}
           aria-label={incoming > 0 ? `친구, 받은 요청 ${incoming}개` : '친구'} title="친구"
           className={cx('absolute right-16 top-3 z-(--z-overlay) p-2 cursor-pointer',
             incoming > 0 ? 'text-gold' : 'text-text-dim hover:text-gold')}>
      <PixelIcon glyph="people" size={20} />
      {incoming > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-4 px-1 text-[10px] leading-4 text-center bg-gold text-bg rounded-sm">
          {incoming > 99 ? '99+' : incoming}
        </span>
      )}
    </Frame>
  );
}
