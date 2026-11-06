import Button from '../../../ui/Button';
import Modal from '../../../ui/Modal';
import NoticeBody from '../../../ui/NoticeBody';

// 다른 창 접속 안내 — 닫을 수 없는 앱 모달(closable=false). 새로고침하면 이 창이 다시 활성 창이 된다.
export default function SessionReplacedModal() {
  return (
    <Modal title="다른 창에서 접속했어요" onClose={() => {}} closable={false}>
      <NoticeBody lead="같은 계정이 다른 창에서 열려 이 화면은 더 진행할 수 없어요."
                  aside="방금 마지막 행동 하나는 저장되지 않았어요.">
        <p>한 계정은 한 창에서만 플레이할 수 있어요.<br />지금까지의 진행은 서버에 안전하게 저장되어 있어요.</p>
      </NoticeBody>
      <Button variant="primary" full className="mt-3" onClick={() => window.location.reload()}>이 창에서 계속하기</Button>
    </Modal>
  );
}
