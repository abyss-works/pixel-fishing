import type { ReactNode } from 'react';
import Button from './Button';
import { HOTKEY_TIER } from './hotkeys';
import Modal from './Modal';
import ModalCard from './ModalCard';
import TextArea from './TextArea';
import type { WindowLayer } from './openWindows';

// 알림 창 — 결과를 알리고 확인을 받는다. value를 주면 읽기 전용 칸에 담아 직접 복사할 수 있게 한다
// (클립보드가 막혔을 때의 대안). 칸을 누르면 전체가 선택된다.
export default function NoticeDialog({ layer = 'app', title, body, value, onClose }: {
  /** 띄울 레이어 — 게임 안 안내 창은 stage, 개발 도구 안은 devtools, 그 밖은 app(기본) */
  layer?: WindowLayer;
  title: string;
  body: ReactNode;
  value?: string;
  onClose: () => void;
}) {
  const card = (
    <ModalCard title={title} onClose={onClose}
      confirm={<Button variant="primary" full onClick={onClose}>확인</Button>}>
      {typeof body === 'string' ? <div className="text-sm leading-relaxed whitespace-pre-line">{body}</div> : body}
      {value !== undefined && (
        <TextArea rows={4} readOnly aria-label="복사할 값" value={value}
                  className="select-text pf-accent text-xs" onFocus={e => e.currentTarget.select()} />
      )}
    </ModalCard>
  );
  if (layer === 'stage') return <Modal layer="stage" hotkeyTier={HOTKEY_TIER.STAGE_CONFIRM} onClose={onClose}>{card}</Modal>;
  if (layer === 'devtools') return <Modal layer="devtools" hotkeyTier={HOTKEY_TIER.BLOCKER} bare onClose={onClose}>{card}</Modal>;
  return <Modal layer="app" hotkeyTier={HOTKEY_TIER.APP_CONFIRM} bare onClose={onClose}>{card}</Modal>;
}
