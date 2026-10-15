import { FISH } from '../../../../game/content/fish';
import type { FishArtStyle } from '../../../../game/rendering/pixel/fishArt';
import FishSprite from '../../../ui/fish/FishSprite';

// 그림체 미리보기 물고기 — 누구나 아는 마을 어종 하나와 생김새가 뚜렷한 바다 어종 하나.
// 두 그림체 모두 형태가 실제 어종과 맞는 종으로 골랐다(시안 시트로 확인).
const SAMPLES = ['carp', 'anglerfish'].map(id => FISH.find(f => f.id === id)!);

/** 같은 물고기를 지정한 그림체로 — 움직임을 지원하는 그림체면 헤엄친다 */
export default function FishArtPreview({ style }: { style: FishArtStyle }) {
  return (
    <>
      {SAMPLES.map(fish => (
        <FishSprite key={fish.id} fish={fish} preset="icon" artStyle={style} animate />
      ))}
    </>
  );
}
