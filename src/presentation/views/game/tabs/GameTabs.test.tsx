import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { TabKey } from './tabs';

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
    expect(screen.getByRole('heading', { level: 3, name: /물고기/ })).toHaveTextContent(/0\s*\/\s*72/);
  });
});

function StatefulTabs() {
  const [tab, setTab] = useState<TabKey>('dex');
  return (
    <GameTabs
      sellBonus={0}
      bagBonus={0}
      region="village"
      activeTab={tab}
      setActiveTab={setTab}
      game={newState()}
      dispatch={vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }))}
      setToast={vi.fn()}
      syncLabel={null}
      syncState="on"
      account={null}
      accountFailed={false}
      nickname={null}
      onRename={async () => null}
      uid={null}
      onAuthChanged={async () => {}}
      sheetOpen={false}
      onSheetOpenChange={vi.fn()}
    />
  );
}

describe('GameTabs - 도감 1단 보기 서브탭과 기존 순환 동기화', () => {
  it('1단 보기 서브탭 클릭, 도감 탭 재클릭, 숫자 3 재입력, Tab 구역 순환이 모두 동기화된다', () => {
    render(<StatefulTabs />);
    expect(screen.getByRole('button', { name: /도감\s*\(일반\)/ })).toHaveClass('active');

    fireEvent.click(screen.getByRole('button', { name: '돌연변이' }));
    expect(screen.getByRole('button', { name: /도감\s*\(돌연변이\)/ })).toHaveClass('active');
    expect(screen.getByRole('heading', { level: 3, name: /^돌연변이/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /도감\s*\(돌연변이\)/ }));
    expect(screen.getByRole('button', { name: /도감\s*\(네임드\)/ })).toHaveClass('active');
    expect(screen.getByRole('button', { name: '네임드' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(document, { key: '3' });
    expect(screen.getByRole('button', { name: /도감\s*\(일반\)/ })).toHaveClass('active');
    expect(screen.getByRole('button', { name: '일반' })).toHaveAttribute('aria-pressed', 'true');

    expect(screen.getByRole('button', { name: /^마을/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: /^태평양/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
