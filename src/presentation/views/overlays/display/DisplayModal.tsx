import { SETTING_PROMPTS } from '../../../../features/announcements/model/whatsNew';
import Modal from '../../../ui/Modal';
import { PromptChoices } from '../whats-new/SettingsStep';

const FISH_ART = SETTING_PROMPTS.find(p => p.id === 'fish-art')!;

// 화면 설정 창 — 보이는 방식에 관한 설정을 모은다. 질문 정의는 소식 창의 새 설정과 같은 것을 써서
// 문구·선택지·미리보기가 두 곳에서 어긋나지 않는다. 고르는 즉시 적용된다.
export default function DisplayModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="화면" onClose={onClose}>
      <PromptChoices prompt={FISH_ART} />
    </Modal>
  );
}
