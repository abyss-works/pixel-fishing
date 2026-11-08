// 유물 상세 창 - 상태(강화 가능, 재료 부족, 최고 레벨, 전설)별 렌더링과 강화 전송, 가방 유물 줄에서 여는 흐름을 고정한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ArtifactDetail from './ArtifactDetail';
import BagTab from './BagTab';
import { resetBagView, setBagSection } from './bagView';
import { artifactById } from '../../../../../game/content/artifacts';
import { newState } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';

afterEach(cleanup);

const COMPASS = artifactById('wreck-compass')!;
const MIRROR = artifactById('mami-wata-mirror')!;
const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const owning = (level: number, have: number): GameState =>
  game({ artifacts: [COMPASS.id], artifactLevels: { [COMPASS.id]: level }, items: { [COMPASS.materialId]: have } });

function open(g: GameState, artifact = COMPASS) {
  const dispatch = vi.fn(() => ({ status: 'ok' as const, state: g, result: { type: 'none' as const } }));
  const setToast = vi.fn();
  render(<ArtifactDetail artifact={artifact} game={g} dispatch={dispatch} setToast={setToast} onClose={() => {}} />);
  return { dispatch, setToast };
}

describe('ArtifactDetail - 상태별 화면', () => {
  it('강화 가능 - 비교 표에 현재와 강화 후 열, 잔액 칸에 보유에서 쓴 뒤 값, 켜진 강화 버튼', () => {
    open(owning(1, 3));
    expect(screen.getByText('현재(Lv.1)')).toBeInTheDocument();
    expect(screen.getByText('강화 후(Lv.2)')).toBeInTheDocument();
    expect(screen.getByText('항해 속도')).toBeInTheDocument();
    expect(screen.getByText('+10%')).toBeInTheDocument();
    expect(screen.getByText('+12.5%')).toBeInTheDocument();
    const cost = within(screen.getByRole('group', { name: '필요한 재료' }));
    expect(cost.getByText(COMPASS.materialName)).toBeInTheDocument();
    expect(cost.getByText('3')).toBeInTheDocument();
    expect(cost.getByText('2')).not.toHaveClass('text-danger');
    expect(screen.getByRole('button', { name: '강화' })).toBeEnabled();
  });

  it('재료 부족 - 강화 버튼이 꺼지고 강화 뒤 값이 위험색', () => {
    open(owning(3, 2));
    expect(screen.getByRole('button', { name: '강화' })).toBeDisabled();
    expect(screen.getByText('-2')).toHaveClass('text-danger');
    expect(screen.getByText('강화 후(Lv.4)')).toBeInTheDocument();
  });

  it('최고 레벨 - 현재 열만 보이고 잔액 칸 없이 꺼진 최고 레벨 버튼', () => {
    open(owning(5, 9));
    expect(screen.getByText('현재(Lv.5)')).toBeInTheDocument();
    expect(screen.getByText('+20%')).toBeInTheDocument();
    expect(screen.queryByText(/강화 후/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '필요한 재료' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '최고 레벨' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '강화' })).not.toBeInTheDocument();
  });

  it('전설 유물 - 레벨 줄과 버튼 없이 보너스와 페널티 두 줄', () => {
    open(game({ artifacts: [MIRROR.id] }), MIRROR);
    expect(screen.getByText('보너스')).toBeInTheDocument();
    expect(screen.getByText('네임드 토벌 하루 +1번')).toBeInTheDocument();
    expect(screen.getByText('페널티')).toBeInTheDocument();
    expect(screen.getByText('네임드 토벌 골드 −30%')).toBeInTheDocument();
    expect(screen.queryByText(/Lv\./)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /강화|최고 레벨/ })).not.toBeInTheDocument();
  });
});

describe('ArtifactDetail - 강화', () => {
  it('강화 버튼은 levelUpArtifact 액션을 보내고 성공 토스트를 골드 톤으로 낸다', async () => {
    const { dispatch, setToast } = open(owning(1, 3));
    fireEvent.click(screen.getByRole('button', { name: '강화' }));
    await waitFor(() => expect(setToast).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith({ type: 'levelUpArtifact', artifact: COMPASS.id });
    expect(setToast).toHaveBeenCalledWith('침선의 나침반의 레벨이 Lv.2까지 올랐어요!', 'gold');
  });
});

describe('BagTab 유물 보기 - 상세 창 열기', () => {
  beforeEach(resetBagView);

  it('줄에 Lv.N과 지금 레벨의 효과가 보이고, 누르면 상세 창이 열린다', () => {
    const g = owning(3, 0);
    setBagSection('artifacts');
    render(<BagTab game={g} dispatch={vi.fn()} setToast={vi.fn()} />);
    expect(screen.getByText('Lv.3')).toBeInTheDocument();
    expect(screen.getByText('항해 속도 +15%')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(COMPASS.name) }));
    expect(within(screen.getByRole('dialog')).getByText('현재(Lv.3)')).toBeInTheDocument();
  });

  it('전설 유물 줄에는 레벨이 없다', () => {
    setBagSection('artifacts');
    render(<BagTab game={game({ artifacts: [MIRROR.id] })} dispatch={vi.fn()} setToast={vi.fn()} />);
    expect(screen.getByText(MIRROR.name)).toBeInTheDocument();
    expect(screen.queryByText(/Lv\./)).not.toBeInTheDocument();
  });
});
