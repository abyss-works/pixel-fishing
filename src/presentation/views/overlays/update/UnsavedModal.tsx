import Button from '../../../ui/Button';
import Modal from '../../../ui/Modal';
import NoticeBody from '../../../ui/NoticeBody';

// 저장 실패 안내 — 닫을 수 없는 앱 모달(closable=false). 서버에 연결하지 못해 행동이 저장되지 않았을 때 새로고침을 안내한다.
export default function UnsavedModal() {
  return (
    <Modal title="저장하지 못했어요" onClose={() => {}} closable={false}
           footer={<Button variant="primary" full className="mt-3" onClick={() => window.location.reload()}>새로고침</Button>}>
      <NoticeBody lead="서버에 연결하지 못해 이번 행동이 저장되지 않았어요.">
        <p>새로고침하면 마지막으로 저장된 상태에서 이어져요.</p>
      </NoticeBody>
    </Modal>
  );
}
