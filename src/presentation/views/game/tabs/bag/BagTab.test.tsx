// 가방 탭 — 전시대 선반(칸 3개)과 진열·회수 버튼이 exhibit 액션으로 이어지는지 고정한다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BagTab, { EXHIBIT_UI_ENABLED } from './BagTab';
import { resetBagView, setBagSection } from './bagView';
import { AUTO_ENERGY_BOAT, COOKING_UNLOCK_BOAT } from '../../../../../game/content/cooking';
import { artifactById } from '../../../../../game/content/artifacts';
import { newState } from '../../../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../../../game/rules/logic';
import type { AccountLockState } from '../../../../../features/display/model/menuLock';

afterEach(cleanup);
beforeEach(resetBagView);

const inst = (uid: string): FishInstance =>
  ({ uid, fishId: 'carp', form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false });
const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

function show(g: GameState, opts: { accountState?: AccountLockState } = {}) {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: g, result: { type: 'none' as const } }));
  const setToast = vi.fn();
  render(<BagTab sellBonus={0} game={g} accountState={opts.accountState} dispatch={dispatch} setToast={setToast} />);
  return { dispatch, setToast };
}

// 전시대 화면은 배포 보류 중이라 꺼져 있다 — 다시 켜면 그대로 검증된다
describe.skipIf(!EXHIBIT_UI_ENABLED)('BagTab — 전시대', () => {
  it('칸 3개를 보이고, 전시 개체의 회수는 slot null 액션을 보낸다', () => {
    const g = game();
    g.exhibit[1] = inst('e');
    const { dispatch } = show(g);
    expect(screen.getAllByText('빈 칸')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /회수$/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'exhibit', uid: 'e', slot: null });
  });

  it('가방 개체의 진열 버튼은 가장 앞의 빈 칸으로 보낸다', () => {
    const g = game({ bag: [inst('a')] });
    g.exhibit[0] = inst('e');
    const { dispatch } = show(g);
    fireEvent.click(screen.getByRole('button', { name: /개체 펼치기$/ }));
    fireEvent.click(screen.getByRole('button', { name: /진열$/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'exhibit', uid: 'a', slot: 1 });
  });

  it('전시대가 다 차면 진열은 요청 없이 안내만 한다', () => {
    const g = game({ bag: [inst('a')], exhibit: [inst('x'), inst('y'), inst('z')] });
    const { dispatch, setToast } = show(g);
    fireEvent.click(screen.getByRole('button', { name: /개체 펼치기$/ }));
    fireEvent.click(screen.getByRole('button', { name: /진열$/ }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledTimes(1);
  });
});

describe('BagTab - 잠금 안내', () => {
  it('잠그면 판매와 기운 얻기에서 빠진다고 알린다', () => {
    const { setToast } = show(game({ bag: [inst('a')] }));
    fireEvent.click(screen.getByRole('button', { name: '잉어 전체 잠금' }));
    expect(setToast).toHaveBeenCalledWith(expect.stringMatching(/ 잠갔어요\. 판매와 기운 얻기에서 빠져요\.$/));
  });

  it('잠금을 풀면 다시 고를 수 있다고 알린다', () => {
    const { setToast } = show(game({ bag: [{ ...inst('a'), locked: true }] }));
    fireEvent.click(screen.getByRole('button', { name: '잉어 전체 잠금 해제' }));
    expect(setToast).toHaveBeenCalledWith(expect.stringMatching(/의 잠금을 풀었어요\. 다시 고를 수 있어요\.$/));
  });
});

describe('BagTab - 판매 가능 금액 미노출', () => {
  it('물고기 섹션 하단에 판매 가능 금액 안내를 두지 않는다', () => {
    render(<BagTab sellBonus={0} game={game({ bag: [inst('a'), inst('b')] })} dispatch={vi.fn()} setToast={vi.fn()} />);
    expect(screen.queryByText(/판매 가능 금액은/)).toBeNull();
  });
});

describe('BagTab - 길드 가방 보너스', () => {
  it('길드 가방 보너스가 없으면 기본 상한을, 있으면 보너스를 더한 상한을 보인다', () => {
    const g = game({ boat: 0, bag: [inst('a'), inst('b')] });
    render(<BagTab sellBonus={0} game={g} dispatch={vi.fn()} setToast={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 3, name: /물고기/ })).toHaveTextContent(/2\s*\/\s*60/);
    cleanup();
    render(<BagTab sellBonus={0} bagBonus={0.2} game={g} dispatch={vi.fn()} setToast={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 3, name: /물고기/ })).toHaveTextContent(/2\s*\/\s*72/);
  });

  it('물고기 제목의 보유 수량과 상한이 1,000마리 이상이면 천 단위 쉼표를 찍는다', () => {
    const bag = Array.from({ length: 1_005 }, (_, i) => inst(`f${i}`));
    const g = game({ boat: 4, bag });
    render(<BagTab sellBonus={0} bagBonus={0.2} game={g} dispatch={vi.fn()} setToast={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 3, name: /물고기/ })).toHaveTextContent(/1,005\s*\/\s*1,200/);
  });
});

describe('BagTab - 유물 섹션 전체 목록·미보유·보유 중만 보기', () => {
  it('전설 유물의 시스템 보너스와 페널티를 유물 목록에 함께 보인다', () => {
    setBagSection('artifacts');
    show(game({ artifacts: ['sargasso-net', 'mami-wata-mirror'] }));
    const sargasso = within(screen.getByRole('button', { name: /사르가소의 그물망/ }));
    expect(sargasso.getByText('미끼 칸 +1칸')).toBeInTheDocument();
    expect(sargasso.getByText('미끼 지속 시간 −50%')).toBeInTheDocument();
    const mirror = within(screen.getByRole('button', { name: /마미 와타의 거울/ }));
    const bonusLine = mirror.getByText('네임드 토벌 하루 +1번');
    const penaltyLine = mirror.getByText('네임드 토벌 골드 −30%');
    expect(bonusLine).toHaveClass('text-accent');
    expect(penaltyLine).toHaveClass('text-danger');
    expect(bonusLine.querySelector('.text-epic')).toBeNull();
    expect(penaltyLine.querySelector('.text-epic')).toBeNull();
  });

  it('기본 꺼짐 상태에서는 유물 8종 전체를 보이고 보유·미보유가 같은 3행 틀에 이름(등급)·구역을 보이며 미보유 효과는 ???와 빈 줄로 가린다', () => {
    setBagSection('artifacts');
    show(game({ artifacts: ['varuna-scale'] }));
    expect(screen.getByRole('heading', { level: 3, name: /유물 1\/8/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보유 중만 보기' })).toHaveAttribute('aria-pressed', 'false');

    // 보유 유물은 버튼(PressRow)으로 상세 창을 열고 32px 스프라이트·이름(등급)·구역을 보이며, 바깥 행에는 로어가 보이지 않는다
    const varuna = artifactById('varuna-scale')!;
    const ownedBtn = screen.getByRole('button', { name: /진주 상인의 저울/ });
    expect(ownedBtn).toBeInTheDocument();
    expect(ownedBtn.querySelector('canvas')).toHaveAttribute('width', '32');
    expect(within(ownedBtn).getByText('(희귀)')).toHaveAttribute('data-rarity', varuna.grade);
    expect(within(ownedBtn).getByText('인도양')).toBeInTheDocument();
    expect(within(ownedBtn).queryByText(varuna.lore)).not.toBeInTheDocument();

    // 미보유 유물은 비활성 행(버튼 아님)으로 흐린 32px 스프라이트·이름(등급)·구역·??? + 높이 유지 빈 줄을 보인다
    expect(screen.queryByRole('button', { name: /해구의 이빨/ })).not.toBeInTheDocument();
    const unownedRow = screen.getByText('해구의 이빨').closest('[data-artifact-row]') as HTMLElement;
    expect(unownedRow.tagName).not.toBe('BUTTON');
    const unownedCanvas = unownedRow.querySelector('canvas');
    expect(unownedCanvas).toHaveAttribute('width', '32');
    expect(unownedCanvas).toHaveClass('grayscale');
    expect(within(unownedRow).getByText('태평양')).toBeInTheDocument();
    expect(within(unownedRow).getByText('(영웅)')).toHaveAttribute('data-rarity', 'epic');
    expect(within(unownedRow).getByText('???')).toBeInTheDocument();
    expect(unownedRow.querySelector('span[aria-hidden="true"]')?.textContent).toBe('\u00A0');

    fireEvent.click(unownedRow);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(ownedBtn);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(varuna.lore)).toBeInTheDocument();
  });

  it('보유 중만 보기 토글을 켜면 보유 유물만 남기고, 보유 0개면 빈 상태 안내를 보인다. 하단 상시 유물 안내 Note는 두지 않는다', () => {
    setBagSection('artifacts');
    show(game({ artifacts: ['varuna-scale'] }));
    expect(screen.queryByText(/유물은 가지고만 있어도/)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: '보유 중만 보기' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('진주 상인의 저울')).toBeInTheDocument();
    expect(screen.queryByText('해구의 이빨')).not.toBeInTheDocument();
    expect(screen.queryByText(/유물은 가지고만 있어도/)).not.toBeInTheDocument();

    cleanup();
    setBagSection('artifacts');
    show(game());
    expect(screen.getByText('해구의 이빨')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '보유 중만 보기' }));
    expect(screen.getByText(/아직 유물이 없어요/)).toBeInTheDocument();
    expect(screen.queryByText('해구의 이빨')).not.toBeInTheDocument();
  });
});

describe('BagTab - 3서브탭, 보기 전환 아이콘, 하단 버튼', () => {
  it('상단 3서브탭(물고기, 아이템, 유물)으로 섹션을 전환하고, 자동 잠금과 기운 얻기 버튼은 물고기 섹션 하단에만 둔다', () => {
    show(game({ boat: COOKING_UNLOCK_BOAT, location: { kind: 'base', id: 'home' }, bag: [inst('a')] }));
    const subtabs = ['물고기', '아이템', '유물'].map(name => screen.getByRole('button', { name }));
    expect(subtabs[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '카드 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '자동 잠금' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기운 얻기' })).toBeInTheDocument();

    fireEvent.click(subtabs[1]);
    expect(screen.getByRole('heading', { level: 3, name: '아이템' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '자동 잠금' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기운 얻기' })).not.toBeInTheDocument();

    fireEvent.click(subtabs[2]);
    expect(screen.getByRole('heading', { level: 3, name: /유물/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '자동 잠금' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기운 얻기' })).not.toBeInTheDocument();
  });

  it('물고기 섹션 하단 액션 바에 자동 잠금과 기운 얻기 버튼이 함께 배치되고 가방이 비면 자동 잠금이 비활성이다', () => {
    const { dispatch } = show(game({ boat: COOKING_UNLOCK_BOAT, location: { kind: 'base', id: 'home' } }));
    const autoLock = screen.getByRole('button', { name: '자동 잠금' });
    const bar = autoLock.closest('div')!;
    expect(bar).toBe(bar.parentElement?.lastElementChild);
    expect(within(bar).getAllByRole('button')).toHaveLength(2);
    expect(within(bar).getByRole('button', { name: '자동 잠금' })).toBeDisabled();
    expect(within(bar).getByRole('button', { name: '기운 얻기' })).toBeEnabled();
    fireEvent.click(autoLock);
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('우상단 보기 전환 아이콘 버튼으로 목록과 카드 보기를 전환하고 발견 어종 카드를 누르면 도감 상세가 열린다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const g = game({
      bag: [inst('a')],
      dex: { carp: { normal: { count: 1, maxSize: 20, first: null } } },
    });
    render(
      <QueryClientProvider client={client}>
        <BagTab sellBonus={0} game={g} dispatch={vi.fn()} setToast={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/자물쇠는 개체마다 걸 수 있고/)).toBeNull();
    expect(screen.queryByText('목록 안내')).toBeNull();

    const toCards = screen.getByRole('button', { name: '카드 보기' });
    fireEvent.click(toCards);
    expect(screen.getByRole('button', { name: '목록 보기' })).toBeInTheDocument();
    const card = screen.getByRole('button', { name: '잉어 일반 1마리 돌연변이 0마리 보유' });
    fireEvent.click(card);
    expect(screen.getByRole('dialog')).toHaveTextContent('잉어');
    expect(screen.getByRole('dialog')).toHaveTextContent('표본');
  });

  it('거점에서 요리 해금·계정이면 기운 얻기 버튼이 활성화되고 클릭 시 앱 모달(layer="app")로 기운 얻기 창을 연다', () => {
    show(game({ boat: COOKING_UNLOCK_BOAT, location: { kind: 'base', id: 'home' } }));
    const btn = screen.getByRole('button', { name: '기운 얻기' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    const dialog = screen.getByRole('dialog', { name: '기운 얻기' });
    expect(dialog.parentElement!.className).toContain('fixed inset-0');
    expect(dialog.parentElement!.className).toContain('z-(--z-app-modal)');
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog', { name: '기운 얻기' })).toBeNull();
  });

  it('바다에서는 가공 플랜트선 이상이면 활성(앱 모달로 열림), 미만이면 비활성 + 사유 툴팁이다', () => {
    show(game({ boat: AUTO_ENERGY_BOAT, location: { kind: 'region', id: 'world' } }));
    const enabled = screen.getByRole('button', { name: '기운 얻기' });
    expect(enabled).toBeEnabled();
    fireEvent.click(enabled);
    const dialog = screen.getByRole('dialog', { name: '기운 얻기' });
    expect(dialog.parentElement!.className).toContain('z-(--z-app-modal)');

    cleanup();
    show(game({ boat: AUTO_ENERGY_BOAT - 1, location: { kind: 'region', id: 'world' } }));
    const disabled = screen.getByRole('button', { name: '기운 얻기' });
    expect(disabled).toBeDisabled();
    fireEvent.mouseEnter(disabled.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('집이나 항구에서만 할 수 있어요.');
  });

  it('게스트가 해금 전(0~4단계)이면 인도양 잠금을, 해금 뒤와 확인 실패는 계정 잠금 툴팁을 보인다', () => {
    show(game({ boat: COOKING_UNLOCK_BOAT - 1, location: { kind: 'region', id: 'village' } }), { accountState: 'guest' });
    const preGuestBtn = screen.getByRole('button', { name: '기운 얻기' });
    expect(preGuestBtn).toBeDisabled();
    fireEvent.mouseEnter(preGuestBtn.parentElement!);
    const preTip = screen.getByRole('tooltip');
    expect(preTip).toHaveTextContent('인도양 항로가 열리면 기운 얻기를 할 수 있어요.');
    expect(preTip).not.toHaveTextContent('태평양');

    cleanup();
    show(game({ boat: AUTO_ENERGY_BOAT, location: { kind: 'base', id: 'home' } }), { accountState: 'guest' });
    const guestBtn = screen.getByRole('button', { name: '기운 얻기' });
    expect(guestBtn).toBeDisabled();
    fireEvent.mouseEnter(guestBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');

    cleanup();
    show(game({ boat: COOKING_UNLOCK_BOAT - 1, location: { kind: 'base', id: 'home' } }), { accountState: 'unverified' });
    const unverifiedBtn = screen.getByRole('button', { name: '기운 얻기' });
    expect(unverifiedBtn).toBeDisabled();
    fireEvent.mouseEnter(unverifiedBtn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('계정을 확인하면 쓸 수 있어요.');
  });

  it('목록 안내·개체 표시 풀 텍스트 없이 물음표 범례 아이콘으로 최대 크기·돌연변이 2줄 툴팁을 보이고, 잠긴 기운 얻기 툴팁에 제목·잠김·구분선을 둔다', () => {
    show(game({ boat: COOKING_UNLOCK_BOAT - 1, location: { kind: 'base', id: 'home' }, bag: [inst('a')] }));
    expect(screen.queryByText('목록 안내')).toBeNull();
    expect(screen.queryByText('개체 표시')).toBeNull();

    const legendBtn = screen.getByRole('button', { name: '개체 표시' });
    fireEvent.focus(legendBtn);
    const focusLegendTip = screen.getByRole('tooltip');
    expect(focusLegendTip).toHaveTextContent('최대 크기');
    expect(focusLegendTip).toHaveTextContent('돌연변이');
    expect(focusLegendTip.querySelector('.text-gold[data-glyph="crown"]')).not.toBeNull();
    expect(focusLegendTip.querySelector('.text-mutation[data-glyph="sparkle"]')).not.toBeNull();
    fireEvent.blur(legendBtn);

    fireEvent.mouseEnter(legendBtn.parentElement!);
    const legendTip = screen.getByRole('tooltip');
    expect(legendTip).toHaveTextContent('최대 크기');
    expect(legendTip).toHaveTextContent('돌연변이');
    fireEvent.mouseLeave(legendBtn.parentElement!);

    const energyBtn = screen.getByRole('button', { name: '기운 얻기' });
    fireEvent.mouseEnter(energyBtn.parentElement!);
    const energyTip = screen.getByRole('tooltip');
    expect(energyTip).toHaveTextContent('기운 얻기');
    expect(energyTip).toHaveTextContent('잠김');
    expect(energyTip.querySelector('.border-t')).not.toBeNull();
  });
});
