import { SETTING_PROMPTS } from '../../../../features/announcements/model/whatsNew';
import { useAlertSettings } from '../../../../features/bounty/service/encounterAlert';
import type { AlertToggle } from '../../../../features/bounty/service/encounterAlert';
import Frame from '../../../ui/Frame';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import SectionTitle from '../../../ui/SectionTitle';
import Tip from '../../../ui/Tip';
import ToggleChip from '../../../ui/ToggleChip';
import type { Notify } from '../../../ui/hud/messageFeed';
import { PromptChoices } from '../whats-new/SettingsStep';

const FISH_ART = SETTING_PROMPTS.find(p => p.id === 'fish-art')!;

const DENIED_REASON = '브라우저가 이 사이트의 알림을 막았어요.\n주소창 왼쪽의 사이트 설정에서 알림을 허용하면 켤 수 있어요.';
const UNSUPPORTED_REASON = '이 브라우저는 알림을 지원하지 않아요.';
const DENIED_TOAST = '브라우저가 알림을 막았어요. 주소창의 사이트 설정에서 허용할 수 있어요.';

function AlertRow({ label, hint, toggle, blockedReason, setToast }: {
  label: string;
  hint: string;
  toggle: AlertToggle;
  /** 권한 때문에 켜고 끌 수 없을 때의 이유. 있으면 토글을 흐리게 둔다 */
  blockedReason: string | null;
  setToast: Notify;
}) {
  const chip = (
    <ToggleChip pressed={toggle.active} disabled={blockedReason !== null} aria-label={label}
                onClick={() => {
                  if (toggle.active) { toggle.disable(); return; }
                  void toggle.enable().then(ok => { if (!ok) setToast(DENIED_TOAST, 'warn'); });
                }}>
      {toggle.active ? '켜짐' : '꺼짐'}
    </ToggleChip>
  );
  return (
    <KeyValueRow label={<Tip text={hint}>{label}</Tip>} value=""
                 action={blockedReason ? <Tip wraps text={blockedReason}>{chip}</Tip> : chip} />
  );
}

// 설정 창 — 화면(물고기 그래픽)과 알림. 값은 창 안에서 바로 고르고 고르는 즉시 적용된다.
// 물고기 그래픽 질문 정의는 소식 창의 새 설정과 같은 것을 써서 문구, 선택지, 미리보기가 어긋나지 않는다.
export default function SettingsModal({ setToast, onClose }: { setToast: Notify; onClose: () => void }) {
  const { permission, encounter, update } = useAlertSettings();
  const blockedReason = permission === 'denied' ? DENIED_REASON : permission === 'unsupported' ? UNSUPPORTED_REASON : null;
  const hint = '다른 화면을 보고 있을 때 브라우저 알림과 탭 제목 깜빡임으로 알려 줘요.';
  return (
    <Modal title="설정" narrow onClose={onClose}>
      <PromptChoices prompt={FISH_ART} describeInTip />
      <SectionTitle>알림</SectionTitle>
      <Frame divided>
        <AlertRow label="네임드 조우" hint={`네임드의 흔적을 만나면 알려 줘요.\n${hint}`} toggle={encounter}
                  blockedReason={blockedReason} setToast={setToast} />
        <AlertRow label="업데이트" hint={`새 버전이 나와 진행이 멈추면 알려 줘요.\n${hint}`} toggle={update}
                  blockedReason={blockedReason} setToast={setToast} />
      </Frame>
    </Modal>
  );
}
