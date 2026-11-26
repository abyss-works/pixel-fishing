import { OVERWRITE_COPY } from '../../../../features/account/model/googleFlow';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import GoogleLogo from '../../../ui/GoogleLogo';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import PixelIcon from '../../../ui/PixelIcon';

// 충돌 확인 창 - 연결하려는 구글 계정이 이미 다른 계정에 연결돼 있을 때(그 구글 계정의 진행 유무와는 관계없다), 구글에서 돌아온 직후 한 번 뜨는 스테이지 모달이다. 계정 관리 창 위에 쌓는 창이 아니다.
// 계정 전환은 그 계정으로 로그인해 그 계정의 진행을 채택하고 이 기기의 게스트 진행을 버린다. 닫기(X, 바깥 누르기, Esc)는 되돌아가기와 같다.
export default function GoogleOverwriteDialog({ busy = false, onProceed, onBack }: {
  busy?: boolean;
  onProceed: () => void;
  onBack: () => void;
}) {
  return (
    <Modal layer="stage" closable={!busy} onClose={onBack}>
      <ModalCard
        title={OVERWRITE_COPY.title}
        onClose={busy ? undefined : onBack}
        confirm={(
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-2">
            <Button full disabled={busy} className="px-2.5 text-sm whitespace-nowrap" onClick={onBack}>{OVERWRITE_COPY.cancel}</Button>
            <Button variant="primary" full disabled={busy} className="px-2.5 text-sm whitespace-nowrap" onClick={onProceed}>{OVERWRITE_COPY.confirm}</Button>
          </div>
        )}
      >
        <Inset
          tone="deep"
          aria-label={OVERWRITE_COPY.summaryLabel}
          className="p-2.5 mobile:p-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 mobile:gap-1.5"
        >
          <div className="p-2 border border-danger/45 bg-(--inset-base) flex flex-col items-start gap-1.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0 w-full">
              <span className="text-xs font-bold leading-[1.3] text-text-dim">{OVERWRITE_COPY.fromLabel}</span>
            </div>
            <Badge tone="danger" size="xs" className="font-bold">{OVERWRITE_COPY.fromStatus}</Badge>
          </div>

          <div className="flex items-center justify-center text-accent shrink-0" aria-hidden="true">
            <PixelIcon glyph="arrowRight" size={14} />
          </div>

          <div className="p-2 border border-gold-dark bg-(--inset-light) flex flex-col items-start gap-1.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0 w-full">
              <GoogleLogo size={16} />
              <span className="text-xs font-bold leading-[1.3] text-gold">{OVERWRITE_COPY.toLabel}</span>
            </div>
            <Badge tone="gold-deep" size="xs" className="font-bold">{OVERWRITE_COPY.toStatus}</Badge>
          </div>
        </Inset>

        <div className="flex flex-col gap-1 text-xs leading-[1.6] text-text">
          <div className="flex items-start gap-1.5">
            <span aria-hidden="true" className="mt-[0.6em] size-1 bg-accent shrink-0" />
            <span className="min-w-0">{OVERWRITE_COPY.body}</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span aria-hidden="true" className="mt-[0.6em] size-1 bg-danger shrink-0" />
            <span className="min-w-0">
              {OVERWRITE_COPY.warnPrefix}{' '}
              <strong className="font-bold text-danger">{OVERWRITE_COPY.warnAnchor}</strong>
            </span>
          </div>
        </div>
      </ModalCard>
    </Modal>
  );
}
