import { useRef, useState } from 'react';
import { SETTING_PROMPTS } from '../../../../features/announcements/model/whatsNew';
import { useAlertSettings } from '../../../../features/bounty/service/encounterAlert';
import type { AlertToggle } from '../../../../features/bounty/service/encounterAlert';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import type { GameAction } from '../../../../game/rules/actions';
import { REJECT_TEXT } from '../../../../game/rules/rules';
import Frame from '../../../ui/Frame';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import SectionTitle from '../../../ui/SectionTitle';
import Tip from '../../../ui/Tip';
import ToggleChip from '../../../ui/ToggleChip';
import type { Notify } from '../../../ui/hud/messageFeed';
import { PromptChoices } from '../whats-new/SettingsStep';

const FISH_ART = SETTING_PROMPTS.find(p => p.id === 'fish-art')!;

const AUTO_LOCK_HINT = '어종·돌연변이별로 더 큰 물고기를 낚으면 자동으로 잠그고 기존 자동 잠금을 풀어요.\n직접 잠근 물고기는 그대로 유지돼요.';
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

// 설정 창 — 화면(물고기 그래픽), 가방(낚을 때 자동 잠금), 알림. 값은 창 안에서 바로 고르고 고르는 즉시 적용된다.
// 물고기 그래픽 질문 정의는 소식 창의 새 설정과 같은 것을 써서 문구, 선택지, 미리보기가 어긋나지 않는다.
export default function SettingsModal({ autoLockOnCatch, dispatch, setToast, onClose }: {
  autoLockOnCatch: boolean;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}) {
  const { permission, encounter, update } = useAlertSettings();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const blockedReason = permission === 'denied' ? DENIED_REASON : permission === 'unsupported' ? UNSUPPORTED_REASON : null;
  const hint = '다른 화면을 보고 있을 때 브라우저 알림과 탭 제목 깜빡임으로 알려 줘요.';
  // 상태 변경 토글 in-flight 가드 — 응답을 기다리는 동안 중복 요청을 막고, 인프라 실패는 전역 구독으로 흘려보낸다
  const toggleAutoLock = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const finish = () => { busyRef.current = false; setBusy(false); };
    const handle = (r: DispatchResult) => {
      finish();
      if (r.status === 'rejected') setToast(REJECT_TEXT[r.error], 'warn');
    };
    const res = dispatch({ type: 'setAutoLockOnCatch', on: !autoLockOnCatch });
    if (res instanceof Promise) {
      void res.then(handle, err => { finish(); throw err; });
    } else {
      handle(res);
    }
  };
  return (
    <Modal title="설정" narrow onClose={onClose}>
      <PromptChoices prompt={FISH_ART} describeInTip />
      <SectionTitle>가방</SectionTitle>
      <Frame divided>
        <KeyValueRow
          label={<Tip text={AUTO_LOCK_HINT}>낚을 때 자동 잠금</Tip>}
          value=""
          action={(
            <ToggleChip pressed={autoLockOnCatch} disabled={busy} aria-label="낚을 때 자동 잠금" onClick={toggleAutoLock}>
              {autoLockOnCatch ? '켜짐' : '꺼짐'}
            </ToggleChip>
          )}
        />
      </Frame>
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
