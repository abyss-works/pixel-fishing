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

  it.each([['PC 레이아웃', false], ['모바일 레이아웃', true]])('%s에서 가방 물고기 하단 액션 바는 스크롤 영역(.pf-vscroll) 바깥 고정 footer 슬롯에 놓인다', (_, mobile) => {
    renderBag(0, mobile);
    const autoLock = screen.getByRole('button', { name: '자동 잠금' });
    const energy = screen.getByRole('button', { name: '기운 얻기' });
    expect(autoLock.closest('.pf-vscroll')).toBeNull();
    expect(energy.closest('.pf-vscroll')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: /물고기/ }).closest('.pf-vscroll')).not.toBeNull();
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

describe('GameTabs - 도감·가방 괄호 없는 탭 라벨과 서브탭 순환 동기화', () => {
  it('1단 보기 서브탭 클릭, 도감 탭 재클릭, 숫자 3 재입력, Tab 구역 순환이 모두 동기화된다', () => {
    render(<StatefulTabs />);
    expect(screen.getByRole('button', { name: '도감' })).toHaveClass('active');

    fireEvent.click(screen.getByRole('button', { name: '돌연변이' }));
    expect(screen.getByRole('button', { name: '도감' })).toHaveClass('active');
    expect(screen.getByRole('heading', { level: 3, name: /^돌연변이/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '도감' }));
    expect(screen.getByRole('button', { name: '도감' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: '네임드' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(document, { key: '3' });
    expect(screen.getByRole('button', { name: '도감' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: '일반' })).toHaveAttribute('aria-pressed', 'true');

    expect(screen.getByRole('button', { name: /^마을/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: /^태평양/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('가방 탭 라벨은 괄호 없이 가방만 보이고 재클릭·숫자 2 재입력 시 물고기→아이템→유물이 순환한다', () => {
    render(<StatefulTabs />);
    const bagTab = screen.getByRole('button', { name: '가방' });
    fireEvent.click(bagTab);
    expect(bagTab).toHaveClass('active');
    expect(screen.getByRole('button', { name: '물고기' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(bagTab);
    expect(screen.getByRole('button', { name: '가방' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: '아이템' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(document, { key: '2' });
    expect(screen.getByRole('button', { name: '유물' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(document, { key: '2' });
    expect(screen.getByRole('button', { name: '물고기' })).toHaveAttribute('aria-pressed', 'true');
  });
});
