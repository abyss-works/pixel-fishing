// 간소화 기운 얻기 창(가방 하단 진입) — 480px 단열 창, 등급 토글 칩(미잠금만), 4종 기운 요약, 확정 시 extractEnergy 후 닫힘.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AUTO_ENERGY_BOAT, ENERGY_ITEM_IDS, toStoredEnergy } from '../../../../game/content/cooking';
import { FISH, REJECT_TEXT, newState } from '../../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../../game/rules/logic';
import type { SpotId } from '../../../../game/content/spots';
import FacilityModal from './FacilityModal';

afterEach(cleanup);

const fishOf = (rarity: string, spot?: SpotId) => FISH.find(f => f.rarity === rarity && (!spot || f.spot === spot))!;
const inst = (uid: string, rarity: string, over: Partial<FishInstance> = {}): FishInstance =>
  ({ uid, fishId: fishOf(rarity).id, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false, ...over });
const seed = (over: Partial<GameState> = {}): GameState =>
  ({ ...newState(), boat: AUTO_ENERGY_BOAT, location: { kind: 'region', id: 'world' }, ...over });

function show(
  game: GameState,
  opts: { base?: 'home' | 'harbor'; result?: { status: 'ok' | 'rejected'; [k: string]: unknown } } = {},
) {
  const dispatch = vi.fn(() => (opts.result ?? {
    status: 'ok' as const,
    state: game,
    result: { type: 'extract' as const, energy: { common: 10, rare: 10, epic: 0, legendary: 0 } },
  }) as never);
  const setToast = vi.fn();
  const onClose = vi.fn();
  render(
    <FacilityModal
      panel="energy"
      base={opts.base}
      sellBonus={0}
      game={game}
      dispatch={dispatch}
      setToast={setToast}
      onClose={onClose}
    />,
  );
  return { dispatch, setToast, onClose };
}

describe('간소화 기운 얻기 창 (가방 하단 진입)', () => {
  it('판매 탭이나 표 없이 480px 단열 창으로 열리고 제목은 기운 얻기다', () => {
    show(seed({ bag: [inst('a', 'common'), inst('b', 'rare')] }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('w-[min(480px,calc(100%-32px))]');
    expect(within(dialog).getByRole('heading', { level: 3, name: '기운 얻기' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '판매' })).toBeNull();
    expect(within(dialog).queryByRole('table')).toBeNull();
  });

  it('기본으로 미잠금 물고기 전체가 등급 칩에 선택되고 잠긴 물고기는 제외된다', () => {
    const game = seed({
      bag: [
        inst('c1', 'common'),
        inst('c2', 'common', { locked: true }),
        inst('r1', 'rare'),
      ],
      items: { [ENERGY_ITEM_IDS.common]: toStoredEnergy(12) },
    });
    show(game);
    const group = screen.getByRole('group', { name: '등급 선택' });
    const commonChip = within(group).getByRole('button', { name: /^일반 등급 \(1마리\)/ });
    const rareChip = within(group).getByRole('button', { name: /^희귀 등급 \(1마리\)/ });
    const epicChip = within(group).getByRole('button', { name: /^영웅 등급 \(0마리\)/ });
    expect(commonChip).toHaveAttribute('aria-pressed', 'true');
    expect(rareChip).toHaveAttribute('aria-pressed', 'true');
    expect(epicChip).toBeDisabled();
    expect(commonChip.querySelector('[data-rarity="common"]')).not.toBeNull();
    expect(epicChip.querySelector('[data-rarity]')).toBeNull();
    expect(screen.getByRole('button', { name: '기운 얻기 (2마리)' })).toBeEnabled();
    expect(screen.getByText(/잠근 물고기 1마리는 빠져요/)).toBeInTheDocument();
  });

  it('등급 칩을 끄고 켜면 선택 마릿수와 기운 획득 요약, 확정 버튼이 즉시 갱신된다', () => {
    const game = seed({
      bag: [inst('c1', 'common'), inst('r1', 'rare')],
      items: { [ENERGY_ITEM_IDS.common]: toStoredEnergy(5) },
    });
    show(game);
    fireEvent.click(screen.getByRole('button', { name: '일반 등급 (1마리) 해제' }));
    expect(screen.getByRole('button', { name: '기운 얻기 (1마리)' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '희귀 등급 (1마리) 해제' }));
    expect(screen.getByRole('button', { name: '기운 얻기 (0마리)' })).toBeDisabled();
    expect(screen.getByText('기운으로 바꿀 등급을 하나 이상 골라 주세요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '일반 등급 (1마리) 선택' }));
    expect(screen.getByRole('button', { name: '기운 얻기 (1마리)' })).toBeEnabled();
  });

  it('모두 잠겨 있거나 비어 있으면 확정 버튼이 비활성이고 안내를 보인다', () => {
    show(seed({ bag: [inst('c1', 'common', { locked: true })] }));
    expect(screen.getByRole('button', { name: '기운 얻기 (0마리)' })).toBeDisabled();
    expect(screen.getByText(/바꿀 수 있는 물고기가 없어요/)).toBeInTheDocument();
  });

  it('확정 클릭 시 선택된 uids로 extractEnergy를 보내고 성공하면 창을 닫고 알림을 남긴다', () => {
    const game = seed({
      bag: [
        inst('c1', 'common'),
        inst('cLocked', 'common', { locked: true }),
        inst('r1', 'rare'),
      ],
    });
    const { dispatch, setToast, onClose } = show(game, {
      result: {
        status: 'ok',
        state: game,
        result: { type: 'extract', energy: { common: 10, rare: 10, epic: 0, legendary: 0 } },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (2마리)' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'extractEnergy', uids: ['c1', 'r1'] });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('생명의 기운 2개를 얻었어요!', 'gold', expect.any(Object));
  });

  it('요청이 거절되면 창을 닫지 않고 거부 안내를 보인다', () => {
    const game = seed({ bag: [inst('c1', 'common')] });
    const { setToast, onClose } = show(game, {
      result: { status: 'rejected', error: 'not-at-sale-base' },
    });
    fireEvent.click(screen.getByRole('button', { name: '기운 얻기 (1마리)' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledWith(REJECT_TEXT['not-at-sale-base'], 'warn');
  });
});
