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
  it('기본은 모두 접혀 있고, 제목 토글이 두 표(기대값 띠·어종 행)를 펼치고 접는다', () => {
    render(<FishTab />);
    const toggle = screen.getByRole('button', { name: `${spot.name} 펼치기` });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(region()).queryAllByRole('table')).toHaveLength(0);

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: `${spot.name} 접기` })).toHaveAttribute('aria-expanded', 'true');
    expect(within(region()).getAllByRole('table')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: `${spot.name} 접기` }));
    expect(screen.getByRole('button', { name: `${spot.name} 펼치기` })).toHaveAttribute('aria-expanded', 'false');
    expect(within(region()).queryAllByRole('table')).toHaveLength(0);
  });

  it('입력하면 그 수역에 초기화 버튼이 생기고, 누르면 오버라이드가 사라진다', () => {
    render(<FishTab />);
    fireEvent.click(screen.getByRole('button', { name: `${spot.name} 펼치기` }));
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

  it('모두 펼치기/접기·구역·검색 필터와 밤 전용 어종 확률 표시가 동작한다', () => {
    render(<FishTab />);
    fireEvent.click(screen.getByRole('button', { name: '모두 펼치기' }));
    expect(screen.getByRole('button', { name: '모두 접기' })).toBeInTheDocument();
    expect(screen.getAllByText(/밤 전용 · \d+\.\d+%$/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('구역 필터'), { target: { value: 'northatlantic' } });
    expect(screen.getByText('2/15개 해역')).toBeInTheDocument();
    expect(screen.getByText('아조레스 해령')).toBeInTheDocument();
    expect(screen.getByText('버뮤다 삼각지대')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('어종·해역 검색'), { target: { value: '버뮤다' } });
    expect(screen.getByText('1/15개 해역')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '모두 접기' }));
    expect(within(screen.getByRole('region', { name: '버뮤다 삼각지대' })).queryAllByRole('table')).toHaveLength(0);
  });
});
