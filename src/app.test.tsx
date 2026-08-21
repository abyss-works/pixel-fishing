// R1~R3b, R5, R5b, R6~R10, R18, R22~R25 + 관리자 
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import App from './App';
import Field from './Field';
import Base from './Home';
import FacilityModal from './FacilityModal';
import { BOATS, RARITY, newState, upgradeCost } from './logic';
import type { GameState } from './logic';
import { HOME_FURNITURE, HARBOR_FURNITURE, V_SPAWN } from './world';
import type { Point, RegionId } from './world';

const SAVE_KEY = 'pixel-fishing-save';

function seed(over: Partial<GameState> = {}) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...newState(), ...over }));
}

const hud = () => document.querySelector('.hud')!.textContent!;
// idle에는 상태 바 자체를 렌더하지 않는다 → 요소 없음 = idle
const phase = () =>
  (document.querySelector('.status-overlay') as HTMLElement | null)?.dataset.phase ?? 'idle';

// jsdom에서 getBoundingClientRect()는 0×0 → 클릭 좌표가 내부 좌표 그대로 전달됨
function clickFurniture(id: string, canvasLabel = '집') {
  const set = canvasLabel === '항구' ? HARBOR_FURNITURE : HOME_FURNITURE;
  const f = set.find(x => x.id === id)!;
  fireEvent.click(screen.getByLabelText(canvasLabel), {
    clientX: f.x + f.w / 2,
    clientY: f.y + f.h / 2,
  });
}

const clickTab = (label: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: label }));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

// ---------- 집(마을 거점): 가구 클릭 → 정비 탭 인라인 패널 ----------

describe('R1: 판매 궤짝 → 사이드바 인라인 패널 (어종별 체크 선택)', () => {
  it('궤짝 클릭 → 기본 전부 체크 → 판매 확정 시 골드 증가', () => {
    seed({ bag: ['carp', 'carp'] }); // 잉어 30G × 2
    render(<App />);
    clickFurniture('sell');
    expect(screen.getByText('잉어')).toBeInTheDocument();      // 내역 표시
    expect(screen.getByText('×2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('판매하기 (+60G)')); // 기본 전부 체크
    expect(hud()).toContain('💰 60G');
    expect(hud()).toContain('0마리');
    expect(screen.queryByText(/판매하기/)).not.toBeInTheDocument(); // 패널 닫힘
  });

  it('체크 해제한 어종은 팔리지 않고 가방에 남는다', () => {
    seed({ bag: ['carp', 'crucian'] }); // 잉어 30G + 붕어 6G
    render(<App />);
    clickFurniture('sell');
    fireEvent.click(screen.getByLabelText('잉어 판매 해제')); // ☑ → ☐
    expect(screen.getByText('판매하기 (+6G)')).toBeInTheDocument(); // 붕어만
    fireEvent.click(screen.getByText(/^판매하기/));
    expect(hud()).toContain('💰 6G');
    expect(hud()).toContain('1마리'); // 잉어는 남는다
  });

  it('전부 체크 해제하면 판매 버튼 비활성', () => {
    seed({ bag: ['carp'] });
    render(<App />);
    clickFurniture('sell');
    fireEvent.click(screen.getByLabelText('잉어 판매 해제'));
    expect(screen.getByText(/^판매하기/)).toBeDisabled();
    fireEvent.click(screen.getByLabelText('잉어 판매 선택')); // 재선택 가능
    expect(screen.getByText(/^판매하기/)).toBeEnabled();
  });

  it('가방이 비면 안내만 (판매 버튼 없음)', () => {
    render(<App />);
    clickFurniture('sell');
    expect(screen.getByText(/가방이 비어 있다/)).toBeInTheDocument();
    expect(screen.queryByText(/판매하기/)).not.toBeInTheDocument();
  });
});

describe('R2: 작업대(낚싯대 강화) → 인라인 패널', () => {
  it('스탯 비교 패널에서 강화 확정: 골드 차감, 낚싯대 +1', () => {
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

// 목공소는 마을 필드(포구 옆) 충돌 트리거로 열린다 — 트리거·충돌은 world.test에서 검증하고,
// 여기서는 패널 자체를 FacilityModal 단독 하네스로 검증한다 (항구 조선소도 같은 모달을 쓴다).
describe('R2b: 목공소/조선소(배 구매) 모달', () => {
  function BoatHarness({ initial }: { initial: GameState }) {
    const [g, setG] = useState(initial);
    const [open, setOpen] = useState(true);
    return open
      ? <FacilityModal panel="boat" game={g} setGame={ng => { lastGame = ng; setG(ng); }}
                       setToast={toastFn} onClose={() => setOpen(false)} />
      : <p>모달 닫힘</p>;
  }
  const renderBoatPanel = (over: Partial<GameState> = {}) => {
    toastFn.mockClear();
    const init = { ...newState(), ...over };
    lastGame = init;
    render(<BoatHarness initial={init} />);
  };

  it('조각배 구매 확정: 골드 차감, 대양 진입 안내', () => {
    renderBoatPanel({ gold: BOATS[0].price });
    fireEvent.click(screen.getByText(/^구매하기/));
    expect(lastGame.boat).toBe(1);
    expect(lastGame.gold).toBe(0);
    expect(lastToast()).toContain('대양');
  });

  it('골드 부족이면 구매 버튼 비활성 + 안내', () => {
    renderBoatPanel({ gold: BOATS[0].price - 1 });
    expect(screen.getByText(/^구매하기/)).toBeDisabled();
    expect(screen.getByText(/골드가 부족하다/)).toBeInTheDocument();
  });

  it('돛단배 구매 시 심해 해구 해금 안내, 명성은 소모되지 않음', () => {
    renderBoatPanel({ boat: 1, gold: BOATS[1].price, fame: BOATS[1].fameReq });
    fireEvent.click(screen.getByText(/^구매하기/));
    expect(lastToast()).toMatch(/마리아나 해구.*열렸다/);
    expect(lastGame.fame).toBe(BOATS[1].fameReq); // 소모 없음
  });

  it('명성 부족이면 구매 버튼 비활성 + 하한 안내 (골드 있어도 불가)', () => {
    renderBoatPanel({ boat: 1, gold: BOATS[1].price, fame: BOATS[1].fameReq - 1 });
    expect(screen.getByText(/^구매하기/)).toBeDisabled();
    expect(screen.getByText(/명성이 부족하다/)).toBeInTheDocument();
  });

  it('최고 단계면 안내만', () => {
    renderBoatPanel({ boat: 4, gold: 999999 });
    expect(screen.getByText(/이미 최고의 배/)).toBeInTheDocument();
    expect(screen.queryByText(/^구매하기/)).not.toBeInTheDocument();
  });

  it('닫기를 누르면 모달이 닫힌다', () => {
    renderBoatPanel({ gold: BOATS[0].price });
    fireEvent.click(screen.getByText('닫기'));
    expect(screen.queryByText(/^구매하기/)).not.toBeInTheDocument();
    expect(screen.getByText('모달 닫힘')).toBeInTheDocument();
  });
});

describe('시설 재클릭 시 패널 토글', () => {
  it('같은 시설 재클릭 → 패널 닫힘', () => {
    seed({ bag: ['carp'] });
    render(<App />);
    clickFurniture('sell');
    expect(screen.getByText(/^판매하기/)).toBeInTheDocument();
    clickFurniture('sell');
    expect(screen.queryByText(/^판매하기/)).not.toBeInTheDocument();
  });
});

describe('쿠폰 입력 (설정 탭)', () => {
  // 정적 COUPONS에 없는 코드는 DB(coupons 테이블) 조회를 거치므로 비동기 — findBy로 대기.
  it('유효 코드 입력 시 골드 지급, 재사용 불가', async () => {
    render(<App />);
    clickTab('설정');
    vi.spyOn(window, 'prompt').mockReturnValue('출항준비');
    fireEvent.click(screen.getByText('🎟️ 쿠폰 입력'));
    await waitFor(() => expect(hud()).toContain('💰 300G'));
    fireEvent.click(screen.getByText('🎟️ 쿠폰 입력'));
    expect(await screen.findByText(/이미 사용한 쿠폰/)).toBeInTheDocument();
    expect(hud()).toContain('💰 300G'); // 중복 지급 없음
  });

  it('없는 코드는 안내만', async () => {
    render(<App />);
    clickTab('설정');
    vi.spyOn(window, 'prompt').mockReturnValue('없는코드');
    fireEvent.click(screen.getByText('🎟️ 쿠폰 입력'));
    expect(await screen.findByText(/없는 쿠폰 코드/)).toBeInTheDocument();
  });
});

describe('R3: 책장(도감) → 도감 탭 (지역 서브탭)', () => {
  it('현재 지역 서브탭 기본 — 잡은 물고기는 상세, 안 잡은 물고기는 ???', () => {
    seed({ caught: { crucian: 3 } });
    render(<App />);
    clickFurniture('dex');
    expect(screen.getByRole('button', { name: /도감\s*\(일반\)/ })).toHaveClass('active');
    expect(screen.getByText('붕어')).toBeInTheDocument();
    expect(screen.getByText('3마리 잡음')).toBeInTheDocument();
    // 집 = 마을 지역 → 마을 어종 12종 중 붕어 1종만 공개
    expect(screen.getAllByText('???').length).toBe(11);
    expect(screen.queryByText('고등어')).not.toBeInTheDocument(); // 다른 지역은 서브탭 뒤에

    fireEvent.click(screen.getByRole('button', { name: /태평양/ })); // 지역 서브탭 전환
    expect(screen.getAllByText('???').length).toBe(11); // 태평양 연안 11종 전부 미획득
    expect(screen.queryByText('붕어')).not.toBeInTheDocument();

    clickTab('도움말');
    expect(screen.queryByText('???')).not.toBeInTheDocument();
  });

  it('활성 도감 탭 재클릭 = 일반↔돌연변이 보기 전환 (v0.3.0)', () => {
    seed({ caught: { crucian: 3 }, maxSize: {}, variantCaught: { crucian: 1 } });
    render(<App />);
    clickFurniture('dex');
    clickTab(/도감\s*\(일반\)/); // 활성 상태에서 한 번 더 → 돌연변이 보기
    expect(screen.getByRole('button', { name: /도감\s*\(돌연변이\)/ })).toHaveClass('active');
    expect(screen.getByText('황금 붕어')).toBeInTheDocument(); // 발견한 변이는 변이 이름
    expect(screen.getByText('1마리 잡음')).toBeInTheDocument(); // 변이 폼 별도 마릿수 (v7)
    expect(screen.getAllByText('???').length).toBe(11); // 나머지 변이는 미확인
    clickTab(/도감\s*\(돌연변이\)/); // 다시 일반으로
    expect(screen.getByText('붕어')).toBeInTheDocument();
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

  it('항구 거점: 여객선 클릭 → onFacility("travel") 호출', () => {
    const onFacility = vi.fn();
    render(<Base base="harbor" game={newState()} onFacility={onFacility} />);
    fireEvent.click(screen.getByLabelText('항구'), { clientX: 44, clientY: 147 }); // 여객선(16,132,56,30) 중심
    expect(onFacility).toHaveBeenCalledWith('travel');
  });
});

// ---------- 필드: 낚시 상태머신 (Field 단독 하네스 — 사이드바 없이 순수 로직 검증) ----------

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
    expect(phase()).toBe('wait'); // 캐스팅 연출 없이 바로 대기
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
    expect(phase()).toBe('wait');
  });
});

describe('R6~R10: 낚시 상태머신 + 타이밍 판정 (마을 연못)', () => {
  it('R6+R8: 캐스팅(즉시 대기) → 입질 → 챔질 → 획득 → 자동 재캐스트', () => {
    renderField('village', POND_SHORE);
    expect(phase()).toBe('idle');
    space();
    expect(phase()).toBe('wait'); // 캐스팅 연출 없이 바로 대기
    act(() => vi.advanceTimersByTime(4000)); // rod1 biteMin
    expect(phase()).toBe('bite');
    space(); // 즉시 챔질 = 커서 0 위치 → 존 밖 = 일반 판정
    expect(phase()).toBe('catch');
    // rng=0 고정이라 변이 롤(0 < 1/3)도 확정 — 표시 이름은 변이 이름이다 (v0.3.0)
    expect(screen.getByText('일반 [황금 붕어] 획득!')).toBeInTheDocument();
    expect(lastToast()).not.toContain('PERFECT');
    expect(lastGame.bag).toEqual(['crucian*']); // R8 — rng=0 → 변이 확정, 변이는 'id*' 엔트리 (v0.3.3)
    expect(lastGame.caught.crucian).toBe(1);
    act(() => vi.advanceTimersByTime(2000)); // 자동 재캐스트
    expect(phase()).toBe('wait');
  });

  it('R6b: 존 중앙 타이밍이면 PERFECT', () => {
    renderField('village', POND_SHORE);
    space();
    act(() => vi.advanceTimersByTime(4000));
    act(() => vi.advanceTimersByTime(500)); // rod1 sweep 1s의 정중앙
    space();
    expect(phase()).toBe('catch');
    expect(lastToast()).toContain('PERFECT');
  });

  it('R7: 화면 클릭도 스페이스와 동일', () => {
    renderField('village', POND_SHORE);
    fireEvent.click(screen.getByLabelText('마을'));
    expect(phase()).toBe('wait');
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.click(screen.getByLabelText('마을'));
    expect(phase()).toBe('catch');
    expect(lastGame.bag).toHaveLength(1);
  });

  it('R9: 게이지를 놓아두면 방치 낚시 — 일반 부스트 추첨으로 자동 획득 (놓침 없음)', () => {
    renderField('village', POND_SHORE);
    space();
    act(() => vi.advanceTimersByTime(4000));
    expect(phase()).toBe('bite');
    act(() => vi.advanceTimersByTime(1000)); // rod1 sweep 1s 경과 = 방치
    expect(phase()).toBe('catch');
    expect(lastToast()).toContain('⚙ 방치');
    expect(lastGame.bag).toEqual(['crucian*']); // rng=0 고정 → 풀 첫 어종(붕어), 변이 확정
  });

  it('R10: bite가 아닐 때 행동 입력은 무시', () => {
    renderField('village', POND_SHORE);
    space(); // 던지면 바로 wait
    space();
    expect(phase()).toBe('wait');
    expect(lastGame.bag).toHaveLength(0);
  });

  it('R5c: 낚시 중 이동 입력 시 낚시 취소', () => {
    renderField('village', POND_SHORE);
    space();
    fireEvent.keyDown(document, { code: 'ArrowLeft' });
    expect(phase()).toBe('idle');
    expect(lastToast()).toContain('접고');
  });
});

describe('R7b: 방치형 루프 (첫 캐스팅 후 무한 반복)', () => {
  it('방치 획득 후에도 같은 군집에 자동 재캐스트 — 손 안 대도 계속 잡힌다', () => {
    renderField('village', POND_SHORE);
    space(); // 최초 1회만 조작 — 던지면 바로 wait
    act(() => vi.advanceTimersByTime(4000)); // wait → bite
    act(() => vi.advanceTimersByTime(1000)); // 방치 → catch
    expect(lastGame.bag).toEqual(['crucian*']);
    act(() => vi.advanceTimersByTime(2000)); // catch → wait (자동 재캐스트)
    expect(phase()).toBe('wait');
    act(() => vi.advanceTimersByTime(4000));
    act(() => vi.advanceTimersByTime(1000)); // 두 번째 방치 획득
    expect(lastGame.bag).toEqual(['crucian*', 'crucian*']);
  });
});

// ---------- 저장 ----------

describe('R18: 저장(클라우드 단일 소스) + 레거시 브리지', () => {
  it('레거시 localStorage 세이브는 최초 로드 때 메모리로 이관된다 (읽기 전용 브리지)', () => {
    seed({ bag: ['carp'], gold: 10 });
    render(<App />);
    expect(hud()).toContain('💰 10G');
    expect(hud()).toContain('1마리');
  });

  it('클라우드 미설정(개발 모드)이면 경고 표시 — 상태는 메모리에만 있음', () => {
    render(<App />);
    clickTab('설정');
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

// ---------- 사이드바 탭: 도움말/지도/패치노트/관리자 ----------

describe('R22: 도움말 탭', () => {
  it('일반 시스템 도움말만 — 어종명(도감 스포일러)·지역 한정 정보는 없다', () => {
    render(<App />);
    clickTab('도움말');
    expect(screen.getByText('낚시와 타이밍')).toBeInTheDocument();
    expect(screen.getAllByText(/PERFECT/).length).toBeGreaterThan(0);
    expect(screen.queryByText('마리아나 해구')).not.toBeInTheDocument(); // 지역 정보는 지역 탭으로
    expect(screen.queryByText('크라켄')).not.toBeInTheDocument();  // 어종은 비공개
    expect(screen.queryByText('붕어')).not.toBeInTheDocument();
  });
});

describe('지역 탭: 현재 지역의 로어·수역·서식 어종', () => {
  it('집(마을)에서는 마을 수역만, 미획득 어종은 ??? 표시', () => {
    seed({ caught: { crucian: 1 } });
    render(<App />);
    clickTab('지역');
    expect(screen.getByText(/고향 마을/)).toBeInTheDocument();
    expect(screen.getByText('마을 연못')).toBeInTheDocument();
    expect(screen.queryByText('태평양')).not.toBeInTheDocument();      // 다른 지역 수역 미노출
    expect(screen.getByText('붕어')).toBeInTheDocument();              // 잡은 어종은 이름 공개
    expect(screen.getAllByText('???').length).toBeGreaterThan(0);      // 미획득은 ???
    expect(screen.queryByText('황금잉어')).not.toBeInTheDocument();    // 스포일러 차단
  });
});

describe('R23b: 미니맵 클릭 = 지역 탭 열기 (M 키 트리거는 폐지)', () => {
  it('필드에서 미니맵을 클릭하면 지역 탭이 열린다', () => {
    seed({ boat: 1 });
    render(<App />);
    clickFurniture('exit'); // 집 → 마을 (필드 진입, 기본 탭=지역)
    expect(screen.getByRole('button', { name: /지역/ })).toHaveClass('active');
    expect(screen.getAllByText(/배.*필요|낚시 가능/).length).toBeGreaterThan(0); // 진입 가능 여부

    clickTab(/도감\s*\(일반\)/); // 다른 탭으로
    fireEvent.click(screen.getByLabelText('미니맵'));
    expect(screen.getByRole('button', { name: /지역/ })).toHaveClass('active');

    fireEvent.keyDown(document, { code: 'KeyM' }); // M 키는 아무 일도 하지 않는다
    expect(screen.getByRole('button', { name: /지역/ })).toHaveClass('active');
  });
});

describe('탭은 씬과 무관하게 5개 고정', () => {
  it('거점에도 정비 탭이 없고, 기본 탭은 지역, 씬을 옮겨도 탭 구성 동일', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /정비/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /지역/ })).toHaveClass('active');
    clickFurniture('exit'); // 집 → 마을
    expect(screen.queryByRole('button', { name: /정비/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /지역/ })).toHaveClass('active');
  });
});

describe('가방 탭: 조회 + 어종 잠금 (전부 판매 제외)', () => {
  it('가방 내역 표시, 잠금 토글 → 전부 판매에서 잠긴 어종 제외', () => {
    seed({ bag: ['carp', 'carp', 'crucian'] }); // 잉어 30G×2 + 붕어 6G
    render(<App />);
    clickTab('가방');
    expect(screen.getByText('잉어')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('잉어 잠금')); // 🔒
    clickFurniture('sell');
    expect(screen.getByText(/판매하기 \(\+6G\)/)).toBeInTheDocument(); // 붕어만 (잠긴 잉어는 자물쇠 고정)
    expect(screen.queryByLabelText(/잉어 판매/)).not.toBeInTheDocument(); // 체크 불가
    fireEvent.click(screen.getByText(/^판매하기/));
    expect(hud()).toContain('💰 6G');
    expect(hud()).toContain('2마리'); // 잠긴 잉어 2마리는 가방에 남는다
  });

  it('잠금 해제하면 다시 판매 대상', () => {
    seed({ bag: ['carp'], locked: ['carp'] });
    render(<App />);
    clickTab('가방');
    fireEvent.click(screen.getByLabelText('잉어 잠금 해제')); // 🔓
    clickFurniture('sell');
    fireEvent.click(screen.getByText(/판매하기 \(\+30G\)/));
    expect(hud()).toContain('💰 30G');
    expect(hud()).toContain('0마리');
  });
});

describe('패치노트 (설정 탭)', () => {
  it('설정 탭에 버전별 아코디언 패치노트 — 범주 뱃지 포함', () => {
    render(<App />);
    clickTab('설정');
    expect(screen.getByText(/방치 낚시가 좋아졌어요/)).toBeInTheDocument();
    expect(screen.getByText(/클라우드 저장이 생겼어요/)).toBeInTheDocument();
    expect(screen.getAllByText('UI').length).toBeGreaterThan(0); // 범주 뱃지
  });
});

describe('관리자 대시보드 (?admin, 설정 탭)', () => {
  it('파라미터 없으면 버튼 없음', () => {
    render(<App />);
    clickTab('설정');
    expect(screen.queryByText(/관리자 대시보드/)).not.toBeInTheDocument();
  });

  it('?admin이면 전체 게임 데이터 열람 가능(숨긴 어종 포함)', () => {
    window.history.replaceState({}, '', '/?admin=1');
    render(<App />);
    clickTab('설정');
    fireEvent.click(screen.getByText(/관리자 대시보드/));
    expect(screen.getByText('크라켄')).toBeInTheDocument(); // 안 잡아도 보임
    expect(screen.getAllByText('2000G').length).toBeGreaterThan(0); // 크라켄 가격(+돛단배)
    expect(screen.getByText('perfect')).toBeInTheDocument();
  });
});
