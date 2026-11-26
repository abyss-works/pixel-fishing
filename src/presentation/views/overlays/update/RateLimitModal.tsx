import Button from '../../../ui/Button';
import Modal from '../../../ui/Modal';
import NoticeBody from '../../../ui/NoticeBody';

// 접속 혼잡 안내 — 닫을 수 없는 앱 모달(closable=false). 익명 세션 발급이 요청 한도(429)로 막혔을 때 잠시 뒤 다시 시도를 안내한다.
export default function RateLimitModal() {
  return (
    <Modal layer="app" title="접속이 몰려 있어요" onClose={() => {}} closable={false}
           footer={<Button variant="primary" full className="mt-3" onClick={() => window.location.reload()}>새로고침</Button>}>
      <NoticeBody lead="같은 네트워크에서 접속이 잠시 몰려 있어요. 잠시 뒤 다시 시도해 주세요.">
        <p>잠시 기다린 뒤 새로고침하면 이어서 접속할 수 있어요.</p>
      </NoticeBody>
    </Modal>
  );
}
