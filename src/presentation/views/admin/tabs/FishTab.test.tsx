// 시뮬레이션 구역 — 수역 칸의 접기 토글과 오버라이드 초기화가 칸 제목 줄 안에서 동작하는지 확인한다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SPOTS } from '../../../../game/rules/logic';
import { selectFishForSpot } from '../../../../features/admin/model/fishSimulation';
import FishTab from './FishTab';

afterEach(() => { cleanup(); sessionStorage.clear(); });

const spot = SPOTS[0];
const region = () => screen.getByRole('region', { name: spot.name });

describe('시뮬레이션 수역 칸', () => {
  it('제목의 토글이 두 표(기대값 띠·어종 행)를 접고 펼친다', () => {
    render(<FishTab />);
    const toggle = screen.getByRole('button', { name: `${spot.name} 접기` });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(region()).getAllByRole('table')).toHaveLength(2);

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: `${spot.name} 펼치기` })).toHaveAttribute('aria-expanded', 'false');
    expect(within(region()).queryAllByRole('table')).toHaveLength(0);
  });

  it('입력하면 그 수역에 초기화 버튼이 생기고, 누르면 오버라이드가 사라진다', () => {
    render(<FishTab />);
    const fish = selectFishForSpot(spot.id, false)[0];
    expect(screen.queryByRole('button', { name: `${spot.name} 오버라이드 초기화` })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변화량 Δ JSON 추출' })).toBeDisabled();

    const price = within(region()).getByLabelText(`${fish.name} 가격`) as HTMLInputElement;
    fireEvent.change(price, { target: { value: '999' } });
    expect(price.value).toBe('999');
    expect(screen.getByRole('button', { name: '변화량 Δ JSON 추출' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: `${spot.name} 오버라이드 초기화` }));
    expect((within(region()).getByLabelText(`${fish.name} 가격`) as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('button', { name: `${spot.name} 오버라이드 초기화` })).not.toBeInTheDocument();
  });
});
