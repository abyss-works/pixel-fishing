import type { Fish } from '../../../game/rules/logic';
import PixelIcon from '../PixelIcon';

/** 발견한 밤 전용 어종 카드의 우측 상단 달 아이콘 — 도감과 가방 카드뷰가 같은 위치·크기·대비로 쓴다.
 *  카드(RARITY_CARD)가 기준 위치(relative)를 갖고, 노치는 좌상단·우하단이라 우측 상단은 비어 있다. */
export default function NightMark({ fish, discovered }: { fish: Fish; discovered: boolean }) {
  if (!fish.night || !discovered) return null;
  return (
    <span data-night-mark className="absolute top-1 right-1 leading-none text-text-dim">
      <PixelIcon glyph="moon" size={12} />
    </span>
  );
}
