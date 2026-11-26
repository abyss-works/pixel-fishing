import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { topZoneOfSpot } from '../../../../game/content/zones';
import { FISH, newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import type { DispatchResult } from '../../../../features/gameplay/service/types';
import { resetKeyScopes } from '../../../ui/hotkeys';
import AchievementsModal from './AchievementsModal';

const originalMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = originalMatchMedia; cleanup(); resetKeyScopes(); });

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

function show(game: GameState, result: DispatchResult) {
  const dispatch = vi.fn(() => result);
  const setToast = vi.fn();
  render(<AchievementsModal game={game} dispatch={dispatch} setToast={setToast} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: '모두 받기' }));
  return { dispatch, setToast };
}

const claimable = seed({ achievements: { 'spot-basic-sea': 'claimable', 'variant-village': 'claimable' } });
const okAll = (gold: number, hats: string[]): DispatchResult => ({
  status: 'ok', state: claimable, result: { type: 'claimAllAchievements', gold, hats },
});

describe('업적 창 모두 받기', () => {
  it('받은 골드와 모자 이름을 금색 안내로 알린다', () => {
    const { setToast } = show(claimable, okAll(25_000, ['straw-hat']));
    expect(setToast).toHaveBeenCalledWith('업적 보상으로 25,000G와 밀짚모자를 받았어요!', 'gold');
  });

  it('골드만 받으면 모자 문구를 넣지 않는다', () => {
    const { setToast } = show(claimable, okAll(25_000, []));
    expect(setToast).toHaveBeenCalledWith('업적 보상으로 25,000G를 받았어요!', 'gold');
  });

  it('모자만 받으면 받은 모자 이름을 알린다', () => {
    const { setToast } = show(claimable, okAll(0, ['straw-hat', 'sou-wester']));
    expect(setToast).toHaveBeenCalledWith('업적 보상으로 밀짚모자, 방수모를 받았어요!', 'gold');
  });
});

describe('업적 창 카드 격자', () => {
  const open = () => render(
    <AchievementsModal game={seed()} dispatch={vi.fn()} setToast={vi.fn()} onClose={() => {}} />,
  );

  it('열 수는 카드 최소 폭으로 정하고 고정 열 수를 쓰지 않으며 가로 스크롤을 만들지 않는다', () => {
    open();
    const name = document.querySelector('[data-achievement-name]') as HTMLElement;
    const grid = name.parentElement?.parentElement?.parentElement?.parentElement as HTMLElement;
    expect(grid.className).toMatch(/\bgrid\b/);
    expect(grid.className).toMatch(/grid-cols-\[repeat\((?:auto-fill|auto-fit),minmax\(/);
    expect(grid.className).toMatch(/minmax\(min\(/);
    expect(grid.className).not.toMatch(/(?:^|\s)grid-cols-\d/);
    expect(grid.className).not.toMatch(/grid-cols-\[repeat\(\d/);
  });

  it('카드마다 진척 막대의 접근성 이름이 다르다', () => {
    open();
    const names = screen.getAllByRole('meter').map(meter => meter.getAttribute('aria-label'));
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
  });

  it('전체 누적 탭과 구역과 유물 탭으로 나뉘며 중복 요약 칸·고정 안내 문구 없이 카드 목록만 보인다', () => {
    const boosted = seed({
      artifacts: ['mami-wata-mirror'],
      achievementCounters: { 'manual.total': 100, 'sell.gold': 1_000_000 },
    });
    render(<AchievementsModal game={boosted} dispatch={vi.fn()} setToast={vi.fn()} onClose={() => {}} />);
    expect(screen.queryByText('적용 중인 누적 보너스')).toBeNull();
    expect(screen.queryByText(/해역 일반 도감 15곳/)).toBeNull();

    // 미완료만 보기는 체크 아이콘 없이 테두리·배경 대비로 켜짐/꺼짐을 구분한다
    const incompleteBtn = screen.getByRole('button', { name: '미완료만 보기' });
    expect(incompleteBtn).toHaveAttribute('aria-pressed', 'false');
    expect(incompleteBtn).toHaveAttribute('data-tier', 'off');
    expect(incompleteBtn.querySelector('[data-glyph="check"]')).toBeNull();
    fireEvent.click(incompleteBtn);
    expect(incompleteBtn).toHaveAttribute('aria-pressed', 'true');
    expect(incompleteBtn).toHaveAttribute('data-tier', 'emphasis');
    expect(incompleteBtn.querySelector('[data-glyph="check"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    expect(screen.queryByText('적용 중인 누적 보너스')).toBeNull();
    expect(screen.queryByText(/달성한 단계는 따로 받지 않아도/)).toBeNull();
    expect(screen.getByText('전체 누적 보너스')).toBeInTheDocument();
    expect(screen.getByText('수동 손맛')).toBeInTheDocument();
    expect(screen.getByText('입질 대기 −1.2%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^받기,/ })).toBeNull();
    expect(screen.queryByText(/조건 단계에 닿으면/)).toBeNull();
    expect(screen.queryByText(/완결/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '구역과 유물' }));
    expect(screen.getByText('구역별 누적 보너스')).toBeInTheDocument();
    expect(screen.getByText('유물 누적 보너스')).toBeInTheDocument();
    expect(screen.getByText('마미 와타의 거울 증폭')).toBeInTheDocument();
    expect(screen.queryByText(/완결/)).toBeNull();
  });

  it('구역과 유물 탭은 도감 포획 기록에 따라 지역 누적 18종 제목·설명·보너스를 손맛 문구 없이 표시한다', () => {
    const pacDayLeg = FISH.find(f => topZoneOfSpot(f.spot) === 'pacific' && f.rarity === 'legendary' && !f.night)!;
    const pacNightLeg = FISH.find(f => topZoneOfSpot(f.spot) === 'pacific' && f.rarity === 'legendary' && f.night === true)!;
    const pacCommon = FISH.find(f => topZoneOfSpot(f.spot) === 'pacific' && f.rarity === 'common')!;
    const dexBoosted = seed({
      dex: {
        [pacDayLeg.id]: { normal: { count: 2, maxSize: 10, first: null } },
        [pacNightLeg.id]: { normal: { count: 1, maxSize: 10, first: null } },
        [pacCommon.id]: { variant: { count: 50, maxSize: 10, first: null } },
      },
    });
    render(<AchievementsModal game={dexBoosted} dispatch={vi.fn()} setToast={vi.fn()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '구역과 유물' }));

    expect(screen.getByText('태평양 전설')).toBeInTheDocument();
    expect(screen.getByText('태평양에서 낮에 나타나는 전설 어종을 낚아요.')).toBeInTheDocument();
    expect(screen.getByText('희귀 이상 출현 비중 +0.3%')).toBeInTheDocument();

    expect(screen.getByText('태평양 밤 전설')).toBeInTheDocument();
    expect(screen.getByText('태평양에서 밤에만 나타나는 전설 어종을 낚아요.')).toBeInTheDocument();
    expect(screen.getByText('밤 어종 출현 비중 +0.3%')).toBeInTheDocument();

    expect(screen.getByText('태평양 돌연변이')).toBeInTheDocument();
    expect(screen.getByText('태평양에서 돌연변이 물고기를 낚아요.')).toBeInTheDocument();
    expect(screen.getByText('돌연변이 출현 비중 +0.3%')).toBeInTheDocument();

    expect(screen.queryByText(/손맛/)).toBeNull();
    expect(screen.queryByText(/직접 챔질로/)).toBeNull();
  });

  it('폐지된 옛 id만 claimable인 세이브에서는 받을 골드가 0G이고 모두 받기가 비활성이다', () => {
    const ghostOnly = seed({
      achievements: { 'zone-basic-pacific': 'claimable', 'manual-variant-1': 'claimable' },
    });
    render(<AchievementsModal game={ghostOnly} dispatch={vi.fn()} setToast={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText('0G')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모두 받기' })).toBeDisabled();
  });

  it('치장 탭에서 미토벌 네임드 카드는 실명을 가린다', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '치장' }));
    fireEvent.click(screen.getByRole('button', { name: /네임드/ }));
    expect(screen.getByText('태평양 네임드 토벌')).toBeInTheDocument();
    expect(screen.queryByText('메갈로돈 토벌')).toBeNull();
  });

  it('치장 탭 필터는 노치 ToggleChip이며 모바일 2열 균형 그리드로 배치되고 바로 착용·옷장 열기 버튼이 없다', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '치장' }));
    const namedBtn = screen.getByRole('button', { name: /네임드/ });
    expect(namedBtn).toHaveAttribute('aria-pressed', 'false');
    expect(namedBtn.parentElement?.className).toContain('mobile:grid-cols-2');
    expect(namedBtn.parentElement?.className).not.toContain('mobile:grid-cols-3');
    expect(screen.queryByRole('button', { name: /바로 착용|옷장 열기/ })).toBeNull();
  });

  it('진행 탭은 미완료만 보기 토글로 완료 업적을 감출 수 있다', () => {
    const done = seed({ achievements: { 'spot-basic-pond': 'claimed' } });
    render(<AchievementsModal game={done} dispatch={vi.fn()} setToast={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText('마을 연못 기초')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '미완료만 보기' }));
    expect(screen.queryByText('마을 연못 기초')).toBeNull();
  });

  it('누적 보너스 탭에서 스탯 창 보너스 탭 바로가기 버튼을 누르면 콜백이 실행된다', () => {
    const onOpenStatsBonus = vi.fn();
    render(
      <AchievementsModal game={seed()} dispatch={vi.fn()} setToast={vi.fn()} onOpenStatsBonus={onOpenStatsBonus} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    fireEvent.click(screen.getByRole('button', { name: '스탯 창 보너스 탭에서 전체 합계 확인' }));
    expect(onOpenStatsBonus).toHaveBeenCalledTimes(1);
  });

  it('게스트 상태에서는 모두 받기 툴팁이 태평양 항로 해금 두 줄 안내를 보이고 거친 포인터에서 누르기로도 열린다', () => {
    render(<AchievementsModal game={claimable} guest dispatch={vi.fn()} setToast={vi.fn()} onClose={() => {}} />);
    const btn = screen.getByRole('button', { name: '모두 받기' });
    expect(btn).toBeDisabled();
    fireEvent.mouseEnter(btn.parentElement!);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
    expect(tooltip).toHaveTextContent('태평양 항로는 조각배(1단계)부터 열려요.');
    cleanup();

    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)', media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    render(<AchievementsModal game={claimable} guest dispatch={vi.fn()} setToast={vi.fn()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '모두 받기' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
  });

  it('비게스트 상태에서 받을 수 있는 업적이 없으면 비활성 이유 툴팁을 보인다', () => {
    render(<AchievementsModal game={seed()} dispatch={vi.fn()} setToast={vi.fn()} onClose={() => {}} />);
    const btn = screen.getByRole('button', { name: '모두 받기' });
    expect(btn).toBeDisabled();
    fireEvent.mouseEnter(btn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('지금 받을 수 있는 업적이 없어요.');
  });
});
