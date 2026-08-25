import Button from './Button';

// 닫기 버튼 — 모달·패널 공통 (사용자 지정 2026-08-24).
// 기본 variant는 테두리 있는 베벨 버튼이다. ghost는 테두리가 없어 버튼인지 안 보인다는
// 피드백이 한 번씩 있었으므로 닫기는 **전부 이 컴포넌트**를 쓰고, ghost에 닫기를 두지 않는다.
export default function CloseButton({ onClick }: { onClick: () => void }) {
  return <Button onClick={onClick}>닫기</Button>;
}
