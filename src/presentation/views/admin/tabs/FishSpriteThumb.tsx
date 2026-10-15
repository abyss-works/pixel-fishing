import FishSprite from '../../../ui/fish/FishSprite';

// 어종 스프라이트 썸네일 — 일반/변이를 나란히(관리자 열람 전용 축소 래퍼).
// FishSprite는 도메인 정보를 몰라 조합은 이 탭에서 맡는다.
export function FishSpriteThumb({ fish }: { fish: Parameters<typeof FishSprite>[0]['fish'] }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      <FishSprite fish={fish} preset="thumb" />
      <FishSprite fish={fish} preset="thumb" form="variant" />
    </div>
  );
}
