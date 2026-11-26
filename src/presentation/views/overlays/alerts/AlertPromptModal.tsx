import { ALERT_COPY, ALERT_DENIED_TEXT, ALERT_DENIED_TOAST, ALERT_ORDER } from '../../../../features/alerts/model/alerts';
import type { AlertKind } from '../../../../features/alerts/model/alerts';
import { useAlertPrompt } from '../../../../features/alerts/service/alertPrompt';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import Button from '../../../ui/Button';
import ButtonRow from '../../../ui/ButtonRow';
import { cx } from '../../../ui/cx';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import type { Notify } from '../../../ui/hud/messageFeed';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';
import ToggleChip from '../../../ui/ToggleChip';

// 알림 종류마다 그림과 색 - 네임드는 표적, 가방은 배낭, 업데이트는 내려받기
const KIND_VISUAL: Record<AlertKind, { glyph: GlyphId; tone: string }> = {
  encounter: { glyph: 'target', tone: 'text-named' },
  bag: { glyph: 'backpack', tone: 'text-gold' },
  update: { glyph: 'download', tone: 'text-accent' },
};

// 브라우저 알림 안내 카드 - 게임에 처음 들어온 직후 한 번, 다른 첫 접속 창이 닫힌 뒤에 뜬다.
// 나중에와 닫기 X는 세 알림을 모두 끄고, 허용은 켠 알림만 켠 채 이 클릭 안에서 브라우저 권한을 묻는다.
export default function AlertPromptModal({ ready, after, setToast }: {
  /** 세이브가 준비됐는지 */
  ready: boolean;
  /** 먼저 뜰 다른 안내 창이 남아 있으면 참 */
  after: boolean;
  setToast: Notify;
}) {
  const prompt = useAlertPrompt({ ready, suspended: after });
  if (!prompt.open) return null;

  const onAllow = () => {
    void prompt.allow().then(permission => {
      if (permission === 'denied') sendNotice(setToast, { kind: 'system.modalRejected', text: ALERT_DENIED_TEXT, toastText: ALERT_DENIED_TOAST });
    });
  };

  return (
    <Modal layer="stage" onClose={prompt.later}>
      <ModalCard
        title="브라우저 알림"
        onClose={prompt.later}
        confirm={(
          <ButtonRow>
            <Button size="sm" onClick={prompt.later}>나중에</Button>
            <Button size="sm" variant="primary" disabled={!prompt.canAllow} onClick={onAllow}>허용</Button>
          </ButtonRow>
        )}
      >
        <p className="text-sm">다른 화면을 보고 있어도 브라우저 알림으로 알려 줘요.</p>
        <Inset divided>
          {ALERT_ORDER.map(kind => {
            const on = prompt.picks[kind];
            return (
              <KeyValueRow
                key={kind}
                label={(
                  <span className={cx('flex items-center gap-2', on ? 'text-text' : 'text-text-dim grayscale brightness-75')}>
                    <PixelIcon glyph={KIND_VISUAL[kind].glyph} size={14} className={on ? KIND_VISUAL[kind].tone : undefined} />
                    {ALERT_COPY[kind].prompt}
                  </span>
                )}
                value=""
                action={(
                  <ToggleChip pressed={on} aria-label={ALERT_COPY[kind].prompt} onClick={() => prompt.toggle(kind)}>
                    {on ? '켜짐' : '꺼짐'}
                  </ToggleChip>
                )}
              />
            );
          })}
        </Inset>
        <Note size="xs" className="my-0">{'허용을 누르면 브라우저가 물어봐요.\n설정에서 종류별로 끌 수 있어요.'}</Note>
      </ModalCard>
    </Modal>
  );
}
