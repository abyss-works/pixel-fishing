// R1~R3b, R5, R5b, R6~R10, R18 
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from './App';
import Field from './Field';
import { newState, upgradeCost, MAX_ROD } from './logic';
import type { GameState } from './logic';
import { FURNITURE, SPAWN } from './world';
import type { Point } from './world';

const SAVE_KEY = 'pixel-fishing-save';

function seed(over: Partial<GameState> = {}) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...newState(), ...over }));
}

const hud = () => document.querySelector('.hud')!.textContent!;
const phase = () => (document.querySelector('.status') as HTMLElement | null)?.dataset.phase;

// jsdom에서 getBoundingClientRect()는 0×0 → Home 클릭 좌표는 내부 좌표 그대로 전달됨
function clickFurniture(id: string) {
  const f = FURNITURE.find(x => x.id === id)!;
  fireEvent.click(screen.getByLabelText('집'), {
    clientX: f.x + f.w / 2,
    clientY: f.y + f.h / 2,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------- 집: 가구 클릭 상호작용 ----------

describe('R1: 판매 궤짝', () => {
  it('클릭 시 전부 판매, 골드 증가', () => {
    seed({ bag: ['carp', 'carp'] }); // 잉어 30G × 2
    render(<App />);
    clickFurniture('sell');
    expect(hud()).toContain('💰 60G');
    expect(hud()).toContain('0마리');
  });

  it('가방이 비면 안내만', () => {
    render(<App />);
    clickFurniture('sell');
    expect(screen.getByText(/팔 물고기가 없다/)).toBeInTheDocument();
    expect(hud()).toContain('💰 0G');
  });
});

describe('R2: 작업대(강화)', () => {
  it('강화 성공: 골드 차감, 낚싯대 +1', () => {
    seed({ gold: upgradeCost(1) });
    render(<App />);
    clickFurniture('rod');
    expect(hud()).toContain('낚싯대 Lv.2');
    expect(hud()).toContain('💰 0G');
  });

  it('골드 부족이면 안내만', () => {
    seed({ gold: upgradeCost(1) - 1 });
    render(<App />);
    clickFurniture('rod');
    expect(screen.getByText(/골드가 부족하다/)).toBeInTheDocument();
    expect(hud()).toContain('낚싯대 Lv.1');
  });

  it('최대 레벨이면 안내만', () => {
    seed({ rod: MAX_ROD, gold: 999999 });
    render(<App />);
    clickFurniture('rod');
    expect(screen.getByText(/이미 최대 강화/)).toBeInTheDocument();
    expect(hud()).toContain(`낚싯대 Lv.${MAX_ROD}`);
  });
});

describe('R3: 책장(도감)', () => {
  it('잡은 물고기는 상세, 안 잡은 물고기는 ???', () => {
    seed({ caught: { crucian: 3 } });
    render(<App />);
    clickFurniture('dex');
    expect(screen.getByText('붕어')).toBeInTheDocument();
    expect(screen.getByText('3마리 잡음')).toBeInTheDocument();
    expect(screen.getAllByText('???').length).toBe(22); // 23종 중 1종만
    expect(screen.getByText(/도감 \(1\/23\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('닫기'));
    expect(screen.queryByText('???')).not.toBeInTheDocument();
  });
});

describe('R3b: 문(출항)', () => {
  it('문 클릭 시 바다로 전환', () => {
    render(<App />);
    clickFurniture('exit');
    expect(screen.getByLabelText('바다')).toBeInTheDocument();
  });

  it('가구가 아닌 곳 클릭은 아무 일 없음', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('집'), { clientX: 160, clientY: 40 });
    expect(screen.getByLabelText('집')).toBeInTheDocument();
  });
});

// ---------- 바다: 낚시 상태머신 ----------

const BAY_SCHOOL: Point = { x: 150, y: 120 };  // pond-1 군집(150,130) 위
const DEEP_SCHOOL: Point = { x: 520, y: 240 }; // deep-1 군집(520,230) 위

let lastGame: GameState;
const toastFn = vi.fn();
const goHomeFn = vi.fn();

function Harness({ initial, pos }: { initial: GameState; pos: Point }) {
  const [g, setG] = useState(initial);
  return <Field game={g} setGame={ng => { lastGame = ng; setG(ng); }}
                setToast={toastFn} goHome={goHomeFn} initialPos={pos} />;
}

function renderField(pos: Point, initial: Partial<GameState> = {}) {
  toastFn.mockClear();
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0); // wait=biteMin(4s), 추첨=붕어
  const init = { ...newState(), ...initial };
  lastGame = init;
  render(<Harness initial={init} pos={pos} />);
}

const space = () => fireEvent.keyDown(document, { code: 'Space' });
const lastToast = () => toastFn.mock.lastCall?.[0] as string;

describe('R5: 캐스팅 판정(군집 위)', () => {
  it('군집 밖이면 캐스팅 거부 + 안내', () => {
    renderField(SPAWN);
    space();
    expect(phase()).toBe('idle');
    expect(lastToast()).toContain('군집 위로');
  });
});

describe('R5b: 해역 티어 잠금', () => {
  it('레벨 미달 군집 캐스팅 거부 + 요구 레벨 안내', () => {
    renderField(DEEP_SCHOOL); // 심해 해구 Lv.10, 현재 Lv.1
    space();
    expect(phase()).toBe('idle');
    expect(lastToast()).toContain('Lv.10');
  });
});

describe('R6~R10: 낚시 상태머신', () => {
  it('R6+R8: 캐스팅 → 대기 → 입질 → 챔질 → 획득 → 자동 재캐스트', () => {
    renderField(BAY_SCHOOL);
    expect(phase()).toBe('idle');
    space(); // 캐스팅
    expect(phase()).toBe('cast');
    act(() => vi.advanceTimersByTime(600));
    expect(phase()).toBe('wait');
    act(() => vi.advanceTimersByTime(4000)); // rod1 biteMin
    expect(phase()).toBe('bite');
    space(); // 챔질
    expect(phase()).toBe('catch');
    expect(screen.getByText('일반 [붕어] 획득!')).toBeInTheDocument();
    expect(lastGame.bag).toEqual(['crucian']); // R8
    expect(lastGame.caught.crucian).toBe(1);
    expect(lastGame.xp).toBe(5);
    act(() => vi.advanceTimersByTime(2000)); // 자동 재캐스트
    expect(phase()).toBe('cast');
  });

  it('R7: 화면 클릭도 스페이스와 동일', () => {
    renderField(BAY_SCHOOL);
    fireEvent.click(screen.getByLabelText('바다')); // 캐스팅
    expect(phase()).toBe('cast');
    act(() => vi.advanceTimersByTime(600));
    act(() => vi.advanceTimersByTime(4000));
    expect(phase()).toBe('bite');
    fireEvent.click(screen.getByLabelText('바다')); // 챔질
    expect(phase()).toBe('catch');
    expect(lastGame.bag).toHaveLength(1);
  });

  it('R9: 놓치면 페널티 없이 자동 재대기', () => {
    renderField(BAY_SCHOOL);
    space();
    act(() => vi.advanceTimersByTime(600));
    act(() => vi.advanceTimersByTime(4000));
    expect(phase()).toBe('bite');
    act(() => vi.advanceTimersByTime(1000)); // rod1 창 1s 초과
    expect(phase()).toBe('wait');
    expect(lastToast()).toContain('놓쳤다');
    expect(lastGame.bag).toHaveLength(0); // 잃는 것 없음
  });

  it('R10: bite가 아닐 때 행동 입력은 무시', () => {
    renderField(BAY_SCHOOL);
    space();
    act(() => vi.advanceTimersByTime(600)); // wait
    space(); // 조기 입력
    expect(phase()).toBe('wait');
    expect(lastGame.bag).toHaveLength(0);
  });

  it('R5c: 낚시 중 이동 입력 시 낚시 취소', () => {
    renderField(BAY_SCHOOL);
    space();
    act(() => vi.advanceTimersByTime(600)); // wait
    fireEvent.keyDown(document, { code: 'ArrowLeft' });
    expect(phase()).toBe('idle');
    expect(lastToast()).toContain('접고');
  });
});

// ---------- 저장 ----------

describe('R18: 저장/복원', () => {
  it('상태 변경이 저장되고 재시작 시 복원된다', () => {
    seed({ bag: ['carp'] });
    render(<App />);
    clickFurniture('sell');
    expect(hud()).toContain('💰 30G');
    cleanup(); // 앱 종료

    render(<App />); // 재시작
    expect(hud()).toContain('💰 30G');
    expect(hud()).toContain('0마리');
  });
});
