// 업데이트 소식 창 — 소식 단계 하단에 설정 > 패치노트 전체 원문 안내를 두고, 새 설정 단계에서는 숨긴다.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetAnnouncements, setLastSeenVersion } from '../../../../platform/api/announcements';
import { resetWhatsNewSession } from '../../../../features/announcements/service/whatsNew';
import { resetKeyScopes } from '../../../ui/hotkeys';
import WhatsNewModal from './WhatsNewModal';

const FOOTER_GUIDE = '자세한 전체 패치노트는 설정 > 패치노트에서 언제든 볼 수 있어요.';

beforeEach(() => {
  localStorage.clear();
  resetAnnouncements();
  resetWhatsNewSession();
  resetKeyScopes();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetAnnouncements();
  resetWhatsNewSession();
  resetKeyScopes();
});

describe('WhatsNewModal 하단 패치노트 안내', () => {
  it('소식 단계에서 하단 안내를 보이고, 새 설정 단계로 넘어가면 감춘다', () => {
    setLastSeenVersion('0.20.0');
    render(<WhatsNewModal game={{ fame: 200, dex: {} }} ready />);

    expect(screen.getByRole('dialog', { name: '업데이트 소식' })).toBeInTheDocument();
    expect(screen.getByText(FOOTER_GUIDE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /다음: 새 설정 고르기/ }));
    expect(screen.getByRole('dialog', { name: '새 설정' })).toBeInTheDocument();
    expect(screen.queryByText(FOOTER_GUIDE)).not.toBeInTheDocument();
  });
});
