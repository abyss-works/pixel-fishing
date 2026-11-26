import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BOUNTIES } from '../../../../../game/content/bounties';
import { namedById } from '../../../../../game/content/named';
import { newState } from '../../../../../game/rules/logic';
import NamedDetail from './NamedDetail';

afterEach(cleanup);
const quest = BOUNTIES.find(q => q.difficulty === 'named')!;
const named = namedById(quest.targetFish!)!;

describe('네임드 상세', () => {
  it('토벌 전에는 이름과 전승을 가리고 잠금 안내를 보인다', () => {
    render(<NamedDetail quest={quest} game={newState()} onClose={() => {}} />);
    const heading = screen.getByRole('heading', { name: '???' });
    expect(heading).toHaveClass('text-text-dim');
    expect(heading).not.toHaveClass('text-named');
    expect(heading).not.toHaveClass('text-gold');
    expect(heading.querySelector('svg')).toBeNull();
    expect(screen.getByText(/토벌한 뒤에 읽을 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(named.chronicle[0])).not.toBeInTheDocument();
  });

  it('토벌한 뒤에는 이름과 전승 네 문단을 오른쪽에 싣는다', () => {
    const game = newState();
    game.dex[named.id] = { normal: { count: 1, maxSize: null, first: '2026-10-18' } };
    render(<NamedDetail quest={quest} game={game} onClose={() => {}} />);
    const heading = screen.getByRole('heading', { name: named.name });
    expect(heading).toHaveClass('text-named');
    expect(heading).not.toHaveClass('text-gold');
    expect(heading.querySelector('svg')).not.toBeNull();
    for (const p of named.chronicle) expect(screen.getByText(p)).toBeInTheDocument();
    expect(screen.getByText('2026-10-18')).toBeInTheDocument();
  });
  it('전승의 모든 문단이 첫 글자 강조를 가진다', () => {
    const game = newState();
    game.dex[named.id] = { normal: { count: 1, maxSize: null, first: '2026-10-18' } };
    render(<NamedDetail quest={quest} game={game} onClose={() => {}} />);
    for (const p of named.chronicle) {
      expect(screen.getByText(p).className).toContain('first-letter:text-gold');
    }
  });
});
