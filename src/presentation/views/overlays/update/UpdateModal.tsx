import Button from '../../../ui/Button';
import Modal from '../../../ui/Modal';

// 새 버전 안내 — 닫을 수 없는 앱 모달. 새로고침만이 출구라 onClose는 비워 둔다
// (백드롭 클릭으로도 닫히지 않는다). 키 차단은 Modal이 맡는다.
export default function UpdateModal() {
  return (
    <Modal title="새 버전이 나왔어요" onClose={() => {}}>
      <p className="text-sm leading-[1.7]">
        게임이 업데이트되어 이 화면은 더 진행할 수 없어요.
        지금까지의 진행은 서버에 안전하게 저장되어 있어요 —
        새로고침하면 바로 이어서 플레이할 수 있어요.
        (방금 마지막 행동 하나는 저장되지 않았을 수 있어요)
      </p>
      <Button variant="primary" full className="mt-3" onClick={() => window.location.reload()}>새로고침하고 이어하기</Button>
    </Modal>
  );
}
