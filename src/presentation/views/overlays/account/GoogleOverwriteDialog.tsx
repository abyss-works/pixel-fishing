import { OVERWRITE_COPY } from '../../../../features/account/model/googleFlow';
import Button from '../../../ui/Button';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';

// 충돌 확인 창 - 연결하려는 구글 계정이 이미 다른 계정에 연결돼 있을 때(그 구글 계정의 진행 유무와는 관계없다), 구글에서 돌아온 직후 한 번 뜨는 앱 모달이다. 계정 관리 창 위에 쌓는 창이 아니다.
// 로그인은 그 계정으로 로그인해 그 계정의 진행을 채택하고 이 기기의 게스트 진행을 버린다. 닫기(X, 바깥 누르기, Esc)는 되돌아가기와 같다.
export default function GoogleOverwriteDialog({ onProceed, onBack }: { onProceed: () => void; onBack: () => void }) {
  return (
    <Modal bare onClose={onBack}>
      <ModalCard title={OVERWRITE_COPY.title} onClose={onBack}
        confirm={(
          <>
            <Button variant="primary" full onClick={onProceed}>{OVERWRITE_COPY.confirm}</Button>
            <Button full onClick={onBack}>{OVERWRITE_COPY.cancel}</Button>
          </>
        )}>
        <Note className="my-0">{OVERWRITE_COPY.body}</Note>
        <Note tone="warn" className="my-0">{OVERWRITE_COPY.warn}</Note>
        <Note size="xs" className="my-0">{OVERWRITE_COPY.back}</Note>
      </ModalCard>
    </Modal>
  );
}
