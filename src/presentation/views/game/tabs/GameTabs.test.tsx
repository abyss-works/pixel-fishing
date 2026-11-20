import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../../../layouts/useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import { newState } from '../../../../game/rules/logic';
import { resetKeyScopes } from '../../../ui/hotkeys';
import { resetOpenWindows } from '../../../ui/openWindows';
import { resetBagView } from './bag/bagView';
import GameTabs from './GameTabs';

beforeEach(() => {
  resetBagView();
  resetOpenWindows();
  resetKeyScopes();
  layout.mobile = false;
});

afterEach(() => {
  cleanup();
  resetKeyScopes();
  resetOpenWindows();
  layout.mobile = false;
});

function renderBag(bagBonus: number, mobile = false) {
  layout.mobile = mobile;
  render(
    <GameTabs
      sellBonus={0}
      bagBonus={bagBonus}
      region="village"
      activeTab="bag"
      setActiveTab={vi.fn()}
      game={{ ...newState(), boat: 0 }}
      dispatch={vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }))}
      setToast={vi.fn()}
      syncLabel={null}
      syncState="on"
      guestProgress="nothing"
      recheckGuestProgress={async () => 'nothing'}
      account={null}
      accountFailed={false}
      nickname={null}
      onRename={async () => null}
      uid={null}
      onAuthChanged={async () => {}}
      sheetOpen={mobile}
      onSheetOpenChange={vi.fn()}
    />,
  );
}

describe('GameTabs - 가방 탭 길드 보너스 전달', () => {
  it.each([['PC 레이아웃', false], ['모바일 레이아웃', true]])('%s에서 가방 탭에 bagBonus를 전달해 상한을 표시한다', (_, mobile) => {
    renderBag(0.2, mobile);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/0\s*\/\s*72/);
  });
});
