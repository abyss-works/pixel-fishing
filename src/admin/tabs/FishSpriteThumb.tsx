import FishSprite from '../../ui/FishSprite';

// 어종 스프라이트 썸네일 — 일반/변이를 나란히(관리자 열람 전용 축소 래퍼).
// ui/FishSprite가 도메인 무지라 조합은 이쪽 탭 소관이다.
export function FishSpriteThumb({ fish }: { fish: Parameters<typeof FishSprite>[0]['fish'] }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      <FishSprite fish={fish} preset="thumb" />
      <FishSprite fish={fish} preset="thumb" form="variant" />
    </div>
  );
}
