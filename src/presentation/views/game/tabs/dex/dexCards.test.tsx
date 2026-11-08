import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BOUNTIES } from '../../../../../game/content/bounties';
import { namedById } from '../../../../../game/content/named';
import { RARITY } from '../../../../../game/content/rarity';
import { newState } from '../../../../../game/rules/logic';
import { fmtGold } from '../../../../ui/format';
import { selectDexGrid } from '../../../../../features/dex/model/catalog';
import DexGrid from './DexGrid';
import VDexNamed from './VDexNamed';

afterEach(cleanup);

describe('도감 네임드 카드', () => {
  const quest = BOUNTIES.find(q => q.difficulty === 'named')!;
  const named = namedById(quest.targetFish!)!;

  it('가로 3 세로 2 비율이고 정사각형이 아니다', () => {
    render(<VDexNamed game={newState()} sub={quest.zone} onSub={() => {}} />);
    const card = screen.getByRole('button', { name: '미확인 네임드 상세 보기' });
    expect(card.className).toContain('aspect-[3/2]');
    expect(card.className).not.toContain('aspect-square');
  });

  it('토벌한 카드는 스프라이트 아래에 이름과 상태를 가운데 정렬한다', () => {
    const game = newState();
    game.dex[named.id] = { normal: { count: 1, maxSize: null, first: '2026-10-18' } };
    render(<VDexNamed game={game} sub={quest.zone} onSub={() => {}} />);
    const card = screen.getByRole('button', { name: `${named.name} 상세 보기` });
    expect(card.className).toContain('aspect-[3/2]');
    const name = screen.getByText(named.name, { selector: 'b' });
    const status = screen.getByText('토벌');
    expect(name.className).toContain('text-center');
    expect(status.className).toContain('text-center');
    expect(name.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('도감 일반 어종 카드', () => {
  function found() {
    const game = newState();
    const grid = selectDexGrid(game, 'village', 'normal');
    const fish = grid.spots.flatMap(s => s.fishes)[0].fish;
    game.dex[fish.id] = { normal: { count: 7, maxSize: null, first: '2026-10-18' } };
    const entry = selectDexGrid(game, 'village', 'normal').spots.flatMap(s => s.fishes).find(e => e.fish.id === fish.id)!;
    return { game, entry };
  }

  it('본문은 이름, 가격, 마릿수 순서이고 등급 글자를 쓰지 않는다', () => {
    const { game, entry } = found();
    const { container } = render(<DexGrid game={game} view="base" sub="village" onSub={() => {}} />);
    const text = container.textContent ?? '';
    const i = text.indexOf(entry.name);
    const p = text.indexOf(fmtGold(entry.price), i);
    const c = text.indexOf('7마리 잡음', p);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(p).toBeGreaterThan(i);
    expect(c).toBeGreaterThan(p);
    const card = container.querySelector(`[data-rarity="${entry.fish.rarity}"][role="button"]`)!;
    expect(card.textContent).not.toContain(RARITY[entry.fish.rarity].name);
    expect(card.textContent).not.toContain('·');
  });
});
