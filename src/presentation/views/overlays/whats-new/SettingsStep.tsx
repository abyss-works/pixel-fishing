import type { ReactNode } from 'react';
import type { SettingPrompt } from '../../../../features/announcements/model/whatsNew';
import { usePromptValue } from '../../../../features/announcements/service/promptValue';
import { isFishArtStyle } from '../../../../game/rendering/pixel/fishArt';
import ChoiceCard from '../../../ui/ChoiceCard';
import Note from '../../../ui/Note';
import SectionTitle from '../../../ui/SectionTitle';
import FishArtPreview from './FishArtPreview';

/** 질문별 선택지 미리보기 — 질문이 늘면 여기 한 줄 */
function previewOf(prompt: SettingPrompt, value: string): ReactNode {
  switch (prompt.id) {
    case 'fish-art':
      return isFishArtStyle(value) ? <FishArtPreview style={value} /> : null;
  }
}

/** 질문 하나의 선택 카드 묶음 — 소식 창의 새 설정 단계와 설정 탭의 화면 창이 함께 쓴다 */
export function PromptChoices({ prompt }: { prompt: SettingPrompt }) {
  const [value, setValue] = usePromptValue(prompt.id);
  return (
    <section className="flex flex-col gap-1.5">
      <SectionTitle>{prompt.title}</SectionTitle>
      <Note size="xs" className="my-0">{prompt.description}</Note>
      <div role="radiogroup" aria-label={prompt.title}
           className="grid grid-cols-2 gap-2 max-[420px]:grid-cols-1">
        {prompt.options.map(o => (
          <ChoiceCard key={o.value} selected={value === o.value} onSelect={() => setValue(o.value)}
                      preview={previewOf(prompt, o.value)}
                      label={o.label} sub={o.sub} badge={o.badge} description={o.description} />
        ))}
      </div>
    </section>
  );
}

// 새 설정 고르기 — 이번에 생긴 설정을 미리보기와 함께 한 화면에서 고른다. 고르는 즉시 적용된다.
export default function SettingsStep({ prompts }: { prompts: readonly SettingPrompt[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Note size="xs" className="my-0">이번 업데이트로 고를 수 있는 설정이 생겼어요. 고르는 즉시 적용돼요.</Note>
      {prompts.map(p => <PromptChoices key={p.id} prompt={p} />)}
    </div>
  );
}
