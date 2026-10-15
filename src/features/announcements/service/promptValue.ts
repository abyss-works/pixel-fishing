import { setFishArtStyle, useFishArtStyle } from '../../display/service/fishArtStyle';
import { isFishArtStyle } from '../../../game/rendering/pixel/fishArt';
import type { SettingPrompt } from '../model/whatsNew';

/** 새 설정 질문의 현재 값과 바꾸기 — 질문 id마다 실제 설정 저장소에 잇는다. 고르는 즉시 적용된다 */
export function usePromptValue(id: SettingPrompt['id']): [string, (value: string) => void] {
  const fishArt = useFishArtStyle();
  switch (id) {
    case 'fish-art':
      return [fishArt, value => { if (isFishArtStyle(value)) setFishArtStyle(value); }];
  }
}
