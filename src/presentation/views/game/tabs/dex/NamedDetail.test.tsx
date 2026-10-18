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
    expect(screen.getByText('???')).toBeInTheDocument();
    expect(screen.getByText(/토벌한 뒤에 읽을 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(named.chronicle[0])).not.toBeInTheDocument();
  });

  it('토벌한 뒤에는 이름과 전승 네 문단을 오른쪽에 싣는다', () => {
    const game = newState();
    game.dex[named.id] = { normal: { count: 1, maxSize: null, first: '2026-10-18' } };
    render(<NamedDetail quest={quest} game={game} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: named.name })).toBeInTheDocument();
    for (const p of named.chronicle) expect(screen.getByText(p)).toBeInTheDocument();
    expect(screen.getByText('2026-10-18')).toBeInTheDocument();
  });
});
