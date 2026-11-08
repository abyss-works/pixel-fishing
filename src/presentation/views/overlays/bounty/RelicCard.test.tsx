// 유물 카드 - 보유한 레벨 유물은 Lv.N을 보이고, 전설 유물은 보너스와 페널티를 교환 전에 보인다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { artifactById } from '../../../../game/content/artifacts';
import RelicCard from './RelicCard';

afterEach(cleanup);

const show = (id: string, owned: boolean, level = 1) => render(
  <RelicCard artifact={artifactById(id)!} owned={owned} level={level} materialCount={0} busy={false} onExchange={() => {}} />,
);

describe('RelicCard', () => {
  it('보유한 레벨 유물은 보유 레벨을 보인다', () => {
    show('wreck-compass', true, 3);
    expect(screen.getByText('Lv.3')).toBeInTheDocument();
    expect(screen.getByText('항해 속도 +15%')).toBeInTheDocument();
  });

  it('갖지 않은 유물은 레벨을 보이지 않는다', () => {
    show('wreck-compass', false);
    expect(screen.queryByText(/^Lv\./)).toBeNull();
  });

  it('전설 유물은 레벨 없이 보너스와 페널티 두 줄을 교환 전에도 보인다', () => {
    show('mami-wata-mirror', false);
    expect(screen.queryByText(/^Lv\./)).toBeNull();
    expect(screen.getByText('네임드 토벌 하루 +1번')).toBeInTheDocument();
    expect(screen.getByText('네임드 토벌 골드 −30%')).toBeInTheDocument();
  });

  it('보유한 전설 유물도 레벨을 보이지 않는다', () => {
    show('mami-wata-mirror', true);
    expect(screen.queryByText(/^Lv\./)).toBeNull();
  });
});
