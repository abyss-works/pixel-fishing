// R1~R3b, R5, R5b, R6~R10, R18 + 관리자 
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from './App';
import Field from './Field';
import Base from './Home';
import { BOATS, RARITY, newState, upgradeCost } from './logic';
import type { GameState } from './logic';
import { HOME_FURNITURE, V_SPAWN } from './world';
import type { Point, RegionId } from './world';

const SAVE_KEY = 'pixel-fishing-save';

function seed(over: Partial<GameState> = {}) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...newState(), ...over }));
}

const hud = () => document.querySelector('.hud')!.textContent!;
const phase = () => (document.querySelector('.status') as HTMLElement | null)?.dataset.phase;

// jsdom에서 getBoundingClientRect()는 0×0 → 클릭 좌표가 내부 좌표 그대로 전달됨
function clickFurniture(id: string, canvasLabel = '집') {
  const f = HOME_FURNITURE.find(x => x.id === id)!;
  fireEvent.click(screen.getByLabelText(canvasLabel), {
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
  window.history.replaceState({}, '', '/');
});

// ---------- 집(마을 거점): 가구 클릭 상호작용 ----------

describe('R1: 판매 궤짝 → 오버레이', () => {
  it('궤짝 클릭 → 내역 오버레이 → 판매 확정 시 골드 증가', () => {
    seed({ bag: ['carp', 'carp'] }); // 잉어 30G × 2
    render(<App />);
    clickFurniture('sell');
    expect(screen.getByText('잉어')).toBeInTheDocument();      // 내역 표시
    expect(screen.getByText('×2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('전부 판매하기 (+60G)')); // 확정
    expect(hud()).toContain('💰 60G');
    expect(hud()).toContain('0마리');
    expect(screen.queryByText(/전부 판매하기/)).not.toBeInTheDocument(); // 닫힘
  });

  it('가방이 비면 안내만 (판매 버튼 없음)', () => {
    render(<App />);
    clickFurniture('sell');
    expect(screen.getByText(/가방이 비어 있다/)).toBeInTheDocument();
    expect(screen.queryByText(/전부 판매하기/)).not.toBeInTheDocument();
  });
});

describe('R2: 작업대(낚싯대 강화) → 오버레이', () => {
  it('스탯 비교 오버레이에서 강화 확정: 골드 차감, 낚싯대 +1', () => {
    seed({ gold: upgradeCost(1) });
    render(<App />);
    clickFurniture('rod');
    fireEvent.click(screen.getByText(/^강화하기/));
    expect(hud()).toContain('낚싯대 Lv.2');
    expect(hud()).toContain('💰 0G');
  });

  it('골드 부족이면 강화 버튼 비활성', () => {
    seed({ gold: upgradeCost(1) - 1 });
    render(<App />);
    clickFurniture('rod');
    expect(screen.getByText(/^강화하기/)).toBeDisabled();
  });

  it('상한 없음: 고레벨에서도 강화 가능 (무한 골드 싱크)', () => {
    seed({ rod: 50, gold: upgradeCost(50) });
    render(<App />);
    clickFurniture('rod');
    fireEvent.click(screen.getByText(/^강화하기/));
    expect(hud()).toContain('낚싯대 Lv.51');
  });
});

describe('R2b: 목공소(배 구매) → 오버레이', () => {
  it('조각배 구매 확정: 골드 차감, 대양 진입 안내', () => {
    seed({ gold: BOATS[0].price });
    render(<App />);
    clickFurniture('boat');
    fireEvent.click(screen.getByText(/^구매하기/));
    expect(hud()).toContain('조각배');
    expect(hud()).toContain('💰 0G');
    expect(screen.getByText(/포구에서 대양/)).toBeInTheDocument();
  });

  it('골드 부족이면 구매 버튼 비활성 + 안내', () => {
    seed({ gold: BOATS[0].price - 1 });
    render(<App />);
    clickFurniture('boat');
    expect(screen.getByText(/^구매하기/)).toBeDisabled();
    expect(screen.getByText(/골드가 부족하다/)).toBeInTheDocument();
  });

  it('돛단배 구매 시 심해 해구 해금 안내, 명성은 소모되지 않음', () => {
    seed({ boat: 1, gold: BOATS[1].price, fame: BOATS[1].fameReq });
    render(<App />);
    clickFurniture('boat');
    fireEvent.click(screen.getByText(/^구매하기/));
    expect(screen.getByText(/마리아나 해구.*열렸다/)).toBeInTheDocument();
    expect(hud()).toContain(`명성 ${BOATS[1].fameReq}`);
  });

  it('명성 부족이면 구매 버튼 비활성 + 하한 안내 (골드 있어도 불가)', () => {
    seed({ boat: 1, gold: BOATS[1].price, fame: BOATS[1].fameReq - 1 });
    render(<App />);
    clickFurniture('boat');
    expect(screen.getByText(/^구매하기/)).toBeDisabled();
    expect(screen.getByText(/명성이 부족하다/)).toBeInTheDocument();
  });

  it('최고 단계면 안내만', () => {
    seed({ boat: 4, gold: 999999 });
    render(<App />);
    clickFurniture('boat');
    expect(screen.getByText(/이미 최고의 배/)).toBeInTheDocument();
    expect(screen.queryByText(/^구매하기/)).not.toBeInTheDocument();
  });
});

describe('쿠폰 입력', () => {
  it('유효 코드 입력 시 골드 지급, 재사용 불가', () => {
    render(<App />);
    vi.spyOn(window, 'prompt').mockReturnValue('출항준비');
    fireEvent.click(screen.getByText('🎟️ 쿠폰'));
    expect(hud()).toContain('💰 300G');
    fireEvent.click(screen.getByText('🎟️ 쿠폰'));
    expect(screen.getByText(/이미 사용한 쿠폰/)).toBeInTheDocument();
    expect(hud()).toContain('💰 300G'); // 중복 지급 없음
  });

  it('없는 코드는 안내만', () => {
    render(<App />);
    vi.spyOn(window, 'prompt').mockReturnValue('없는코드');
    fireEvent.click(screen.getByText('🎟️ 쿠폰'));
    expect(screen.getByText(/없는 쿠폰 코드/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByText('닫기'));
    expect(screen.queryByText('???')).not.toBeInTheDocument();
  });
});

describe('R3b: 문(마을로) + 항구 여객선', () => {
  it('문 클릭 시 마을 필드로 전환', () => {
    render(<App />);
    clickFurniture('exit');
    expect(screen.getByLabelText('마을')).toBeInTheDocument();
  });

  it('가구가 아닌 곳 클릭은 아무 일 없음', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('집'), { clientX: 160, clientY: 40 });
    expect(screen.getByLabelText('집')).toBeInTheDocument();
  });

  it('항구 거점: 여객선 클릭 → goTravel 호출', () => {
    const travelFn = vi.fn();
    render(<Base base="harbor" game={newState()} setGame={() => {}}
                 setToast={() => {}} goField={() => {}} goTravel={travelFn} />);
    fireEvent.click(screen.getByLabelText('항구'), { clientX: 44, clientY: 147 }); // 여객선(16,132,56,30) 중심
    expect(travelFn).toHaveBeenCalled();
  });
});

// ---------- 필드: 낚시 상태머신 ----------

const POND_SHORE: Point = { x: 150, y: 92 };   // v-pond-1(150,118) 물가
const SEA_SCHOOL: Point = { x: 340, y: 210 };  // o-sea-1 위
const DEEP_SCHOOL: Point = { x: 520, y: 320 }; // o-deep-1 위

let lastGame: GameState;
const toastFn = vi.fn();
const goBaseFn = vi.fn();

function Harness({ region, initial, pos }: { region: RegionId; initial: GameState; pos: Point }) {
  const [g, setG] = useState(initial);
  return <Field region={region} game={g} setGame={ng => { lastGame = ng; setG(ng); }}
                setToast={toastFn} goBase={goBaseFn} initialPos={pos} />;
}

function renderField(region: RegionId, pos: Point, initial: Partial<GameState> = {}) {
  toastFn.mockClear();
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0); // wait=biteMin(4s), 추첨=풀 첫 어종, 자동챔질=sweep×0.3
  const init = { ...newState(), ...initial };
  lastGame = init;
  render(<Harness region={region} initial={init} pos={pos} />);
}

const space = () => fireEvent.keyDown(document, { code: 'Space' });
const lastToast = () => toastFn.mock.lastCall?.[0] as string;

describe('R5: 캐스팅 판정(군집 근처)', () => {
  it('군집 밖이면 캐스팅 거부 + 안내', () => {
    renderField('village', V_SPAWN);
    space();
    expect(phase()).toBe('idle');
    expect(lastToast()).toContain('가까이');
  });
});

describe('R5b: 배 게이트', () => {
  it('마을 연못은 배 없이 낚시 가능', () => {
    renderField('village', POND_SHORE); // boat 0
    space();
    expect(phase()).toBe('cast');
  });

  it('태평양은 배 1단계 필요', () => {
    renderField('ocean', SEA_SCHOOL, { boat: 0 });
    space();
    expect(phase()).toBe('idle');
    expect(lastToast()).toContain('배 1단계');
  });

  it('심해 해구는 배 2단계 필요, 충분하면 캐스팅', () => {
    renderField('ocean', DEEP_SCHOOL, { boat: 1 });
    space();
    expect(phase()).toBe('idle');
    expect(lastToast()).toContain('배 2단계');
    cleanup();
    renderField('ocean', DEEP_SCHOOL, { boat: 2 });
    space();
    expect(phase()).toBe('cast');
  });
});

describe('R6~R10: 낚시 상태머신 + 타이밍 판정 (마을 연못)', () => {
  it('R6+R8: 캐스팅 → 대기 → 입질 → 챔질 → 획득 → 자동 재캐스트', () => {
    renderField('village', POND_SHORE);
    expect(phase()).toBe('idle');
    space();
    expect(phase()).toBe('cast');
    act(() => vi.advanceTimersByTime(600));
    expect(phase()).toBe('wait');
    act(() => vi.advanceTimersByTime(4000)); // rod1 biteMin
    expect(phase()).toBe('bite');
    space(); // 즉시 챔질 = 커서 0 위치 → 존 밖 = 일반 판정
    expect(phase()).toBe('catch');
    expect(screen.getByText('일반 [붕어] 획득!')).toBeInTheDocument();
    expect(lastToast()).not.toContain('PERFECT');
    expect(lastGame.bag).toEqual(['crucian']); // R8
    expect(lastGame.caught.crucian).toBe(1);
    act(() => vi.advanceTimersByTime(2000)); // 자동 재캐스트
    expect(phase()).toBe('cast');
  });

  it('R6b: 존 중앙 타이밍이면 PERFECT', () => {
    renderField('village', POND_SHORE);
    space();
    act(() => vi.advanceTimersByTime(600));
    act(() => vi.advanceTimersByTime(4000));
    act(() => vi.advanceTimersByTime(500)); // rod1 sweep 1s의 정중앙
    space();
    expect(phase()).toBe('catch');
    expect(lastToast()).toContain('PERFECT');
  });

  it('R7: 화면 클릭도 스페이스와 동일', () => {
    renderField('village', POND_SHORE);
    fireEvent.click(screen.getByLabelText('마을'));
    expect(phase()).toBe('cast');
    act(() => vi.advanceTimersByTime(600));
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.click(screen.getByLabelText('마을'));
    expect(phase()).toBe('catch');
    expect(lastGame.bag).toHaveLength(1);
  });

  it('R9: 게이지를 놓아두면 방치 낚시 — 최하 어종 자동 획득 (놓침 없음)', () => {
    renderField('village', POND_SHORE);
    space();
    act(() => vi.advanceTimersByTime(600));
    act(() => vi.advanceTimersByTime(4000));
    expect(phase()).toBe('bite');
    act(() => vi.advanceTimersByTime(1000)); // rod1 sweep 1s 경과 = 방치
    expect(phase()).toBe('catch');
    expect(lastToast()).toContain('⚙ 방치');
    expect(lastGame.bag).toEqual(['minnow']); // 연못 최하 어종 = 피라미
  });

  it('R10: bite가 아닐 때 행동 입력은 무시', () => {
    renderField('village', POND_SHORE);
    space();
    act(() => vi.advanceTimersByTime(600)); // wait
    space();
    expect(phase()).toBe('wait');
    expect(lastGame.bag).toHaveLength(0);
  });

  it('R5c: 낚시 중 이동 입력 시 낚시 취소', () => {
    renderField('village', POND_SHORE);
    space();
    act(() => vi.advanceTimersByTime(600));
    fireEvent.keyDown(document, { code: 'ArrowLeft' });
    expect(phase()).toBe('idle');
    expect(lastToast()).toContain('접고');
  });
});

describe('R7b: 방치형 루프 (첫 캐스팅 후 무한 반복)', () => {
  it('방치 획득 후에도 같은 군집에 자동 재캐스트 — 손 안 대도 계속 잡힌다', () => {
    renderField('village', POND_SHORE);
    space(); // 최초 1회만 조작
    act(() => vi.advanceTimersByTime(600));  // cast → wait
    act(() => vi.advanceTimersByTime(4000)); // wait → bite
    act(() => vi.advanceTimersByTime(1000)); // 방치 → catch
    expect(lastGame.bag).toEqual(['minnow']);
    act(() => vi.advanceTimersByTime(2000)); // catch → cast (자동)
    expect(phase()).toBe('cast');
    act(() => vi.advanceTimersByTime(600));
    act(() => vi.advanceTimersByTime(4000));
    act(() => vi.advanceTimersByTime(1000)); // 두 번째 방치 획득
    expect(lastGame.bag).toEqual(['minnow', 'minnow']);
  });
});

// ---------- 저장/관리자 ----------

describe('R18: 저장(클라우드 단일 소스) + 레거시 브리지', () => {
  it('레거시 localStorage 세이브는 최초 로드 때 메모리로 이관된다 (읽기 전용 브리지)', () => {
    seed({ bag: ['carp'], gold: 10 });
    render(<App />);
    expect(hud()).toContain('💰 10G');
    expect(hud()).toContain('1마리');
  });

  it('클라우드 미설정(개발 모드)이면 경고 표시 — 상태는 메모리에만 있음', () => {
    render(<App />);
    expect(screen.getByText(/클라우드 미설정/)).toBeInTheDocument();
  });

  it('구버전 세이브는 조각배 증정 + 도감 소급 명성 + 환영 안내', () => {
    localStorage.setItem(SAVE_KEY,
      JSON.stringify({ gold: 500, xp: 200, rod: 4, bag: [], caught: { tuna: 2 }, spot: 'sea' }));
    render(<App />);
    expect(hud()).toContain('💰 500G');
    expect(hud()).toContain('낚싯대 Lv.4');
    expect(hud()).toContain('조각배'); // v1 증정
    expect(hud()).toContain(`명성 ${RARITY.epic.fame * 2}`); // 참치 2마리 소급
    expect(screen.getByText(/소급 인정/)).toBeInTheDocument();
  });
});

describe('관리자 대시보드 (?admin)', () => {
  it('파라미터 없으면 버튼 없음', () => {
    render(<App />);
    expect(screen.queryByText(/관리자 대시보드/)).not.toBeInTheDocument();
  });

  it('?admin이면 전체 게임 데이터 열람 가능(숨긴 어종 포함)', () => {
    window.history.replaceState({}, '', '/?admin=1');
    render(<App />);
    fireEvent.click(screen.getByText(/관리자 대시보드/));
    expect(screen.getByText('크라켄')).toBeInTheDocument(); // 안 잡아도 보임
    expect(screen.getAllByText('2000G').length).toBeGreaterThan(0); // 크라켄 가격(+돛단배)
    expect(screen.getByText('perfect')).toBeInTheDocument();
  });
});
