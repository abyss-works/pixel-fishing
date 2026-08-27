// R1~R3b, R5, R5b, R6~R10, R18, R22~R25 + 관리자 
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import App from './App';
import Field from './stage/Field';
import Base from './stage/Base';
import FacilityModal from './stage/FacilityModal';
import { resetBagView } from './sidebar/bagView';
import { resetKeyScopes } from './hotkeys';
import { BIG_CATCH_PERCENTILE, VARIANT_PRICE_MULT } from './game/balance';
import { WALK_BAG_CAP } from './data/boats';
import { TAB_ORDER } from './sidebar/tabs';
import { BOATS, RARITY, COUPONS, newState, upgradeCost } from './game/logic';
import type { FishInstance, FormId, FormRecord, GameState } from './game/logic';
import type { GameAction } from './game/actions';
import { LocalBackend } from './backend/local';
import { when } from './backend/types';
import { HOME_FURNITURE, HARBOR_FURNITURE, V_SPAWN, O_SCHOOLS } from './world';
import type { Point, RegionId } from './world';

const SAVE_KEY = 'pixel-fishing-save';

function seed(over: Partial<GameState> = {}) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...newState(), ...over }));
}

// 세이브 v8 픽스처 헬퍼 — 개체(가방)와 도감 기록을 짧게 쓴다
let uidSeq = 0;
// 기본은 **크기 있는 개체** — 흔한 경우다. 크기 미상(v0.4.0 이관분)은 명시적으로 null을 준다
const inst = (
  fishId: string, form: FormId = 'normal', size: number | null = 20, locked = false,
): FishInstance =>
  ({ uid: `u${++uidSeq}`, fishId, form, size, caughtAt: null, spot: null, judgment: null, locked });
const rec = (count: number, maxSize: number | null = null, first: string | null = null): FormRecord =>
  ({ count, maxSize, first });
/** 가방 개체의 종·폼만 뽑아 비교 (uid는 매번 달라 직접 비교 불가) */
const bagOf = (g: GameState) => g.bag.map(i => `${i.fishId}:${i.form}`);

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
  resetBagView();   // 가방 보기 설정은 모듈 전역이라 케이스 사이에 새로 시작해야 한다
  resetKeyScopes(); // 키 스코프 스택도 모듈 전역
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
    seed({ bag: [inst('carp'), inst('carp')] }); // 잉어 30G × 2
    render(<App />);
    clickFurniture('sell');
    expect(screen.getByText('잉어')).toBeInTheDocument();      // 내역 표시
    expect(screen.getByText('×2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('판매하기 (+60G)')); // 기본 전부 체크
    expect(hud()).toContain('골드 60G');
    expect(hud()).toContain('0마리');
    expect(screen.queryByText(/판매하기/)).not.toBeInTheDocument(); // 패널 닫힘
  });

  it('체크 해제한 어종은 팔리지 않고 가방에 남는다', () => {
    seed({ bag: [inst('carp'), inst('crucian')] }); // 잉어 30G + 붕어 6G
    render(<App />);
    clickFurniture('sell');
    fireEvent.click(screen.getByLabelText('잉어 판매 해제')); // ☑ → ☐
    expect(screen.getByText('판매하기 (+6G)')).toBeInTheDocument(); // 붕어만
    fireEvent.click(screen.getByText(/^판매하기/));
    expect(hud()).toContain('골드 6G');
    expect(hud()).toContain('1마리'); // 잉어는 남는다
  });

  it('전부 체크 해제하면 판매 버튼 비활성', () => {
    seed({ bag: [inst('carp')] });
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

describe('R1b 개체 단위 선택 — 같은 종에서 큰 놈만 남기기', () => {
  it('개체 하나만 해제하면 그것만 남고 나머지가 팔린다', () => {
    seed({ bag: [inst('carp', 'normal', 42), inst('carp', 'normal', 12)] });
    render(<App />);
    clickFurniture('sell');

    // 기본은 전부 선택 — 두 마리분
    expect(screen.getByText('판매하기 (+60G)')).toBeInTheDocument();

    // 개체는 기본으로 펼쳐져 있다 — 개체화가 화면에 바로 보여야 한다
    expect(screen.getByText('42.0cm')).toBeInTheDocument();
    expect(screen.getByText('최대')).toBeInTheDocument();

    // 42cm 개체를 판매에서 제외 → 12cm 한 마리만 팔린다
    fireEvent.click(screen.getByText('42.0cm').closest('[role="button"]')!);
    expect(screen.getByText('판매하기 (+30G)')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument(); // 부분 선택 표시

    fireEvent.click(screen.getByText(/^판매하기/));
    expect(hud()).toContain('골드 30G');
    expect(hud()).toContain('1마리');
    // 남은 게 "큰 놈"인지 가방 탭에서 확인한다 — 이 화면의 존재 이유가 그것
    clickTab(/^가방/);
    expect(screen.getByText('42.0cm')).toBeInTheDocument();
    expect(screen.queryByText('12.0cm')).not.toBeInTheDocument();
  });

  it('잠근 개체는 보여도 고를 수 없다', () => {
    seed({ bag: [inst('carp', 'normal', 20, true)] });
    render(<App />);
    clickFurniture('sell');
    // 개체 줄이 클릭 대상이 아니다 (role=button 없음)
    expect(screen.getByText('20.0cm').closest('[role="button"]')).toBeNull();
    expect(screen.getByText(/^판매하기/)).toBeDisabled();
  });
});

describe('R2: 작업대(낚싯대 강화) → 인라인 패널', () => {
  it('스탯 비교 패널에서 강화 확정: 골드 차감, 낚싯대 +1', () => {
    seed({ gold: upgradeCost(1) });
    render(<App />);
    clickFurniture('rod');
    fireEvent.click(screen.getByText(/^강화하기/));
    expect(hud()).toContain('낚싯대 Lv.2');
    expect(hud()).toContain('골드 0G');
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
    const backend = useState(() => new LocalBackend(initial))[0];
    const dispatch = (a: GameAction) => when(backend.dispatch(a), r => {
      if (r.status === 'ok') { lastGame = r.state; setG(r.state); }
      return r;
    });
    return open
      ? <FacilityModal panel="boat" game={g} dispatch={dispatch}
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
    seed({ bag: [inst('carp')] });
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
    fireEvent.click(screen.getByText('쿠폰 입력'));
    await waitFor(() => expect(hud()).toContain(`골드 ${COUPONS['출항준비'].gold}G`));
    fireEvent.click(screen.getByText('쿠폰 입력'));
    expect(await screen.findByText(/이미 사용한 쿠폰/)).toBeInTheDocument();
    expect(hud()).toContain(`골드 ${COUPONS['출항준비'].gold}G`); // 중복 지급 없음
  });

  it('없는 코드는 안내만', async () => {
    render(<App />);
    clickTab('설정');
    vi.spyOn(window, 'prompt').mockReturnValue('없는코드');
    fireEvent.click(screen.getByText('쿠폰 입력'));
    expect(await screen.findByText(/없는 쿠폰 코드/)).toBeInTheDocument();
  });
});

describe('R3: 책장(도감) → 도감 탭 (지역 서브탭)', () => {
  it('현재 지역 서브탭 기본 — 잡은 물고기는 상세, 안 잡은 물고기는 ???', () => {
    seed({ dex: { crucian: { normal: rec(3) } } });
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
    seed({ dex: { crucian: { normal: rec(3), variant: rec(1) } } });
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
// 어군 좌표는 앵커 파생 — 마스크 재생성과 무관하게 항상 어군 위에 선다
const SEA_SCHOOL: Point = O_SCHOOLS.find(s => s.id === 'o-sea-1')!;
const DEEP_SCHOOL: Point = O_SCHOOLS.find(s => s.id === 'o-deep-1')!;

let lastGame: GameState;
const toastFn = vi.fn();
const goBaseFn = vi.fn();

function Harness({ region, initial, pos }: { region: RegionId; initial: GameState; pos: Point }) {
  const [g, setG] = useState(initial);
  const backend = useState(() => new LocalBackend(initial))[0];
  const dispatch = (a: GameAction) => when(backend.dispatch(a), r => {
    if (r.status === 'ok') { lastGame = r.state; setG(r.state); }
    return r;
  });
  return <Field region={region} game={g} dispatch={dispatch}
                setToast={toastFn} onScene={goBaseFn} initialPos={pos} />;
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

describe('서버 응답 지연 내성 (catch 홀드)', () => {
  it('응답이 늦어도 catch 페이즈가 만료되지 않는다 — 카드 미표시 버그 방지', () => {
    // 영원히 안 끝나는 dispatch — HTTP 지연의 극단 모형 (타임아웃은 HttpBackend 소관)
    const pending = () => new Promise<never>(() => {});
    toastFn.mockClear();
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<Field region="village" game={newState()} dispatch={pending as never}
                  setToast={toastFn} onScene={goBaseFn} initialPos={POND_SHORE} />);
    space();                                       // 캐스팅
    act(() => vi.advanceTimersByTime(4000));       // wait(rng=0 → biteMin 4s) 경과 → bite
    expect(phase()).toBe('bite');
    space();                                       // 챔질 → dispatch 대기
    expect(phase()).toBe('catch');
    act(() => vi.advanceTimersByTime(10000));      // 응답이 안 와도
    expect(phase()).toBe('catch');                 // 재캐스트로 넘어가지 않는다 (결과 도착 후 카운트다운)
  });
});

describe('폼 타이핑 보호 (전역 키 리스너)', () => {
  it('입력 요소에 포커스가 있으면 게임 키를 가로채지 않는다 — 계정 모달 타이핑', () => {
    renderField('village', POND_SHORE);
    space();
    expect(phase()).toBe('wait'); // 낚시 중
    const input = document.createElement('input');
    document.body.appendChild(input);
    // 인풋에서 친 키는 게임 입력이 아니다 — preventDefault 없음(반환 true) + 낚시 유지
    expect(fireEvent.keyDown(input, { code: 'Space' })).toBe(true);
    expect(fireEvent.keyDown(input, { code: 'KeyA' })).toBe(true);
    expect(phase()).toBe('wait');
    expect(toastFn).not.toHaveBeenCalledWith(expect.stringContaining('낚시를 접고'));
    input.remove();
    // 인풋 밖(문서)의 이동 키는 여전히 게임 입력 — 낚시 취소
    fireEvent.keyDown(document, { code: 'KeyA' });
    expect(lastToast()).toContain('낚시를 접고 이동한다');
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
    expect(bagOf(lastGame)).toEqual(['crucian:variant']); // R8 — rng=0 → 변이 확정 (개체, v8)
    expect(lastGame.dex.crucian.variant?.count).toBe(1);
    act(() => vi.advanceTimersByTime(2000)); // 자동 재캐스트
    expect(phase()).toBe('wait');
  });

  it('R6b: 존 중앙 타이밍이면 GOOD (연못은 파워 초과 11 → 노란 존만)', () => {
    renderField('village', POND_SHORE);
    space();
    act(() => vi.advanceTimersByTime(4000));
    act(() => vi.advanceTimersByTime(700)); // sweep 1.4s의 정중앙
    space();
    expect(phase()).toBe('catch');
    expect(lastToast()).toContain('GOOD');
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
    act(() => vi.advanceTimersByTime(3000)); // sweep 3s 경과 = 방치
    expect(phase()).toBe('catch');
    expect(lastToast()).toContain('방치');
    expect(bagOf(lastGame)).toEqual(['crucian:variant']); // rng=0 고정 → 풀 첫 어종(붕어), 변이 확정
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
    act(() => vi.advanceTimersByTime(3000)); // 방치 → catch (sweep 3s)
    expect(bagOf(lastGame)).toEqual(['crucian:variant']);
    act(() => vi.advanceTimersByTime(2000)); // catch → wait (자동 재캐스트)
    expect(phase()).toBe('wait');
    act(() => vi.advanceTimersByTime(4000));
    act(() => vi.advanceTimersByTime(3000)); // 두 번째 방치 획득
    expect(bagOf(lastGame)).toEqual(['crucian:variant', 'crucian:variant']);
  });
});

// ---------- 저장 ----------

describe('R18: 저장(클라우드 단일 소스) + 레거시 브리지', () => {
  it('레거시 localStorage 세이브는 최초 로드 때 메모리로 이관된다 (읽기 전용 브리지)', () => {
    seed({ bag: [inst('carp')], gold: 10 });
    render(<App />);
    expect(hud()).toContain('골드 10G');
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
    expect(hud()).toContain('골드 500G');
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

  it('첫 화면은 짧다 — 세부는 전부 접혀 있고 필요할 때 편다', () => {
    render(<App />);
    clickTab('도움말');
    const topics = [...document.querySelectorAll('details')];
    expect(topics.length).toBeGreaterThanOrEqual(5);
    expect(topics.every(d => !d.open)).toBe(true); // 기본 닫힘 — 열려 있으면 예전처럼 길어진다
    // 항상 보이는 건 시작 안내뿐
    expect(screen.getByText('처음이라면')).toBeInTheDocument();
    expect(screen.getByText(/여기까지만 알아도 충분해요/)).toBeInTheDocument();
  });

  it('수치는 balance에서 읽어 자동으로 맞는다 — 손으로 적으면 밸런스 바꿀 때 갈라진다', () => {
    render(<App />);
    clickTab('도움말');
    const help = document.body.textContent ?? '';
    expect(help).toContain(`맨발 ${WALK_BAG_CAP}마리`);   // 가방 용량 — 배 속성(bagCap)
    expect(help).toContain(`${BOATS[BOATS.length - 1].bagCap}마리`);
    expect(help).toContain(`상위 ${BIG_CATCH_PERCENTILE}%`);  // 월척 기준
    expect(help).toContain(`${VARIANT_PRICE_MULT}배 가격`);   // 변이 판매가
  });

  it('갱신된 기능이 도움말에 있다 — 단축키·개체 잠금·두 보기·계정', () => {
    render(<App />);
    clickTab('도움말');
    const help = document.body.textContent ?? '';
    for (const topic of ['키보드 단축키', 'Shift + Tab', '자물쇠', '목록 ↔ 카드', '계정 연동', '새로고침']) {
      expect(help, topic).toContain(topic);
    }
  });
});

describe('지역 탭: 현재 지역의 로어·수역·서식 어종', () => {
  it('집(마을)에서는 마을 수역만, 미획득 어종은 ??? 표시', () => {
    seed({ dex: { crucian: { normal: rec(1) } } });
    render(<App />);
    clickTab('지역');
    expect(screen.getByText(/고향 마을/)).toBeInTheDocument();
    expect(screen.getByText('마을 연못')).toBeInTheDocument();
    expect(screen.queryByText('태평양')).not.toBeInTheDocument();      // 다른 지역 수역 미노출
    expect(screen.getByText('붕어')).toBeInTheDocument();              // 잡은 어종은 이름 공개
    expect(screen.getAllByText('???').length).toBeGreaterThan(0);      // 미획득은 ???
    expect(screen.queryByText('황금잉어')).not.toBeInTheDocument();    // 스포일러 차단
  });

  it('서식 어종은 카드로 — 실루엣·이름·등급만, 미획득은 실루엣 유지', () => {
    seed({ dex: { crucian: { normal: rec(1) } } });
    render(<App />);
    clickTab('지역');
    // 잡은 종은 이름이, 안 잡은 종은 스프라이트가 미확인 라벨을 단다
    expect(screen.getByLabelText('붕어')).toBeInTheDocument();
    expect(screen.getAllByLabelText('미확인 어종').length).toBeGreaterThan(0);
    // 등급은 카드마다 붙는다 — 잡기 전에도 티어는 알 수 있다(도감 카드와 같은 규칙)
    expect(screen.getAllByText('일반').length).toBeGreaterThan(0);
    // 마릿수·가격은 여기 소관이 아니다 (도감이 한다)
    expect(screen.queryByText(/마리 잡음/)).toBeNull();
  });
});

describe('설정 — 내 정보 (문의 대응용 uid 노출)', () => {
  it('편지 창구가 열린다 — 로컬(오프라인)은 로그인 상태로 가정한다', () => {
    seed({});
    render(<App />);
    clickTab('설정');
    fireEvent.click(screen.getByText('편지 쓰기'));
    expect(screen.getByText('개발자에게 편지')).toBeInTheDocument();
    // 빈 글은 못 보낸다
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('계정과 ID를 보여주고 복사 버튼을 단다', () => {
    seed({});
    render(<App />);
    clickTab('설정');
    expect(screen.getByText('내 정보')).toBeInTheDocument();
    // 로컬은 로그인 상태로 가정하므로 가짜 계정이 뜬다(배포 빌드에선 실제 이메일 또는 '게스트')
    // 계정 섹션과 내 정보 두 곳에 뜬다 (로컬은 로그인 상태로 가정 — 실물은 이메일 또는 '게스트')
    expect(screen.getAllByText('dev@localhost')).toHaveLength(2);
    // body에 user-select:none이 걸려 있어 드래그 복사가 안 된다 → 버튼이 유일한 경로.
    // 화면은 가운데를 가리지만 복사는 전체 값이라, 버튼이 없으면 문의 대응이 불가능해진다.
    expect(screen.getByRole('button', { name: '복사' })).toBeInTheDocument();
    expect(document.body.textContent).toContain('전체가 복사돼요');
  });
});

describe('위치 복원 — 새로고침하면 있던 곳에서 재개', () => {
  it('세이브에 대양이 적혀 있으면 대양에서 시작한다', () => {
    seed({ boat: 1, location: { kind: 'region', id: 'ocean' } });
    render(<App />);
    expect(screen.getByLabelText('바다')).toBeInTheDocument();   // 필드 캔버스
    expect(screen.queryByLabelText('집')).not.toBeInTheDocument();
  });

  it('기본은 집 — 위치가 없던 구세이브도 안전하다', () => {
    seed({});
    render(<App />);
    expect(screen.getByLabelText('집')).toBeInTheDocument();
  });
});

describe('R23b: 미니맵 클릭 = 지역 탭 열기 (M 키 트리거는 폐지)', () => {
  it('필드에서 미니맵을 클릭하면 지역 탭이 열린다', () => {
    seed({ boat: 1 });
    render(<App />);
    clickFurniture('exit'); // 집 → 마을 (필드 진입, 기본 탭=지역)
    expect(screen.getByRole('button', { name: /지역/ })).toHaveClass('active');

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
  it('가방 내역 표시, 행 머리 잠금 → 그 종 전 개체가 전부 판매에서 빠진다', () => {
    seed({ bag: [inst('carp'), inst('carp'), inst('crucian')] }); // 잉어 30G×2 + 붕어 6G
    render(<App />);
    clickTab(/^가방/);
    expect(screen.getByText('잉어')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('잉어 전체 잠금')); // 🔒 — 행 머리는 그 종 전부에 건다
    clickFurniture('sell');
    expect(screen.getByText(/판매하기 \(\+6G\)/)).toBeInTheDocument(); // 붕어만 (잠긴 잉어는 자물쇠 고정)
    expect(screen.queryByLabelText(/잉어 판매/)).not.toBeInTheDocument(); // 체크 불가
    fireEvent.click(screen.getByText(/^판매하기/));
    expect(hud()).toContain('골드 6G');
    expect(hud()).toContain('2마리'); // 잠긴 잉어 2마리는 가방에 남는다
  });

  it('행 안 개체는 큰 놈부터 — 잡은 순서와 무관하고 크기 미상은 맨 뒤', () => {
    // 입력을 일부러 뒤섞는다: 정렬이 실제로 일어나는지 봐야 한다
    seed({ bag: [inst('carp', 'normal', 12), inst('carp', 'normal', null), inst('carp', 'normal', 42)] });
    render(<App />);
    clickTab(/^가방/);
    const shown = screen.getAllByText(/cm|미상/).map(e => e.textContent);
    expect(shown).toEqual(['최대 42.0cm', '42.0cm', '12.0cm', '미상']);
  });

  it('TAB_ORDER가 실제 탭바 순서와 같다 — 어긋나면 숫자키가 엉뚱한 탭을 연다', () => {
    seed({});
    render(<App />);
    const shown = [...document.querySelectorAll('.pf-tabbar button')]
      .map(b => b.textContent ?? '');
    expect(shown).toHaveLength(TAB_ORDER.length);
    // 라벨은 동적(가방(목록)/도감(일반))이라 키가 아니라 대표 글자로 대조한다
    const HEAD: Record<string, string> = {
      region: '지역', bag: '가방', dex: '도감', help: '도움말', settings: '설정',
    };
    expect(shown.map((t, i) => t.startsWith(HEAD[TAB_ORDER[i]]))).toEqual(shown.map(() => true));
  });

  it('숫자 1~5로 탭 직행 — 탭바에 보이는 순서 그대로', () => {
    seed({});
    render(<App />);
    const active = () => document.querySelector('.pf-tabbar button.active')?.textContent;
    fireEvent.keyDown(document, { key: '2' });
    expect(active()).toContain('가방');
    fireEvent.keyDown(document, { key: '5' });
    expect(active()).toContain('설정');
    fireEvent.keyDown(document, { key: '1' });
    expect(active()).toContain('지역');
    fireEvent.keyDown(document, { key: '6' });      // 없는 번호
    expect(active()).toContain('지역');
  });

  it('Tab은 탭을 떠나지 않는다 — 보기 없는 탭에서는 아무것도 안 한다', () => {
    seed({});
    render(<App />);
    const active = () => (document.querySelector('.pf-tabbar button.active')?.textContent ?? '')
      .replace(/\s+/g, '');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(active()).toBe('지역');
    fireEvent.keyDown(document, { key: '5' }); // 설정
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(active()).toBe('설정');
  });

  it('Tab은 가방 안에서 목록 ↔ 카드를 순환한다', () => {
    seed({});
    render(<App />);
    fireEvent.keyDown(document, { key: '2' });
    const active = () => (document.querySelector('.pf-tabbar button.active')?.textContent ?? '')
      .replace(/\s+/g, '');
    expect(active()).toBe('가방(목록)');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(active()).toBe('가방(카드)');
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(active()).toBe('가방(목록)');
  });

  it('도감에서 Tab은 지역을 순회한다 — 메뉴 탭은 그대로고 서브탭이 움직인다', () => {
    seed({}); // 시작 씬 = 마을 → 도감 초기 지역도 마을
    render(<App />);
    fireEvent.keyDown(document, { key: '3' });
    expect(screen.getByRole('heading', { name: '마을 연못' })).toBeInTheDocument(); // 수역 헤딩 = 열람 지역
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('heading', { name: '태평양' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '마리아나 해구' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('heading', { name: '드래곤 홀' })).toBeInTheDocument();
    // 역방향으로 되돌아간다
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('heading', { name: '마리아나 해구' })).toBeInTheDocument();
    const active = document.querySelector('.pf-tabbar button.active')?.textContent ?? '';
    expect(active).toContain('도감'); // 끝까지 메뉴 탭은 안 바뀐다
  });

  it('같은 숫자를 한 번 더 누르면 그 탭의 보기가 순환된다', () => {
    seed({});
    render(<App />);
    const active = () => (document.querySelector('.pf-tabbar button.active')?.textContent ?? '')
      .replace(/\s+/g, '');
    fireEvent.keyDown(document, { key: '2' });
    fireEvent.keyDown(document, { key: '2' });
    expect(active()).toBe('가방(카드)');
    fireEvent.keyDown(document, { key: '3' }); // 다른 탭 경유 — 보기 건드리지 않는다
    expect(active()).toContain('도감(일반)');
    fireEvent.keyDown(document, { key: '3' }); // 같은 숫자 재입력 = 보기 순환
    expect(active()).toContain('돌연변이');
  });

  it('모달이 떠 있으면 아래 레이어가 키를 못 받는다 — 로그인 모달 키 탈취 재발 방지', () => {
    seed({});
    render(<App />);
    clickFurniture('sell'); // 정비 모달 (stage 레이어)
    fireEvent.keyDown(document, { key: '3' });
    expect(document.querySelector('.pf-tabbar button.active')?.textContent).toContain('지역');
  });

  it('입력 중에는 단축키가 안 먹는다 — 쿠폰/계정 폼 타이핑 보호', () => {
    seed({});
    render(<App />);
    fireEvent.keyDown(document, { key: '5' });
    const input = document.body.appendChild(document.createElement('input'));
    fireEvent.keyDown(input, { key: '2' }); // 폼에 포커스가 있는 상태의 키 입력
    expect(document.querySelector('.pf-tabbar button.active')?.textContent).toContain('설정');
    input.remove();
  });

  it('Ctrl/Cmd 조합은 가로채지 않는다 — 브라우저 탭 전환', () => {
    seed({});
    render(<App />);
    fireEvent.keyDown(document, { key: '2', ctrlKey: true });
    expect(document.querySelector('.pf-tabbar button.active')?.textContent).toContain('지역');
  });

  it('v0.4.0 이관분(크기 미상)은 마릿수 한 줄로 접힌다 — 수천 마리여도 줄이 안 는다', () => {
    // v0.4.0 가방은 어종 문자열 배열이라 이관 개체는 전부 size: null이 된다.
    // uid 말고 서로 다른 점이 없으므로 개별 줄로 그릴 근거가 없다.
    const many = Array.from({ length: 2000 }, () => inst('crucian', 'normal', null));
    seed({ bag: [...many, inst('crucian', 'variant', null), inst('crucian', 'normal', 30)] });
    render(<App />);
    clickTab(/^가방/);

    expect(screen.getByText('×2000')).toBeInTheDocument();  // 일반 미상 묶음
    expect(screen.getByText('×1')).toBeInTheDocument();     // 변이 미상 묶음 (폼은 가른다)
    expect(screen.getByText('30.0cm')).toBeInTheDocument(); // 크기 있는 개체는 그대로 한 줄
    // 개체 줄은 셋뿐 — 크기 1 + 미상 묶음 2
    expect(screen.getAllByText(/^미상$/)).toHaveLength(2);
  });

  it('크기 미상 묶음은 통째로 잠긴다 — 하나씩 고를 근거가 없다', () => {
    seed({ bag: Array.from({ length: 5 }, () => inst('crucian', 'normal', null)) });
    render(<App />);
    clickTab(/^가방/);
    fireEvent.click(screen.getByLabelText('크기 미상 5마리 잠금'));
    clickFurniture('sell');
    expect(screen.getByText(/^판매하기/)).toBeDisabled(); // 5마리 전부 판매에서 빠진다
  });

  it('행 안 정렬: 변이가 먼저, 각 무리에서 큰 개체부터', () => {
    seed({ bag: [
      inst('carp', 'normal', 40), inst('carp', 'variant', 12),
      inst('carp', 'normal', 8), inst('carp', 'variant', 33),
    ] });
    render(<App />);
    clickTab(/^가방/);
    const shown = screen.getAllByText(/cm/).map(e => e.textContent?.replace(/ 상위 .*/, ''));
    // 머리(최대 40.0cm) 다음 — 변이 33 → 변이 12 → 일반 40 → 일반 8
    expect(shown).toEqual(['최대 40.0cm', '33.0cm', '12.0cm', '40.0cm', '8.0cm']);
  });

  it('최대 배지는 폼별 — 변이 중 가장 큰 놈도 배지를 받는다', () => {
    // 변이는 "종만 같고 다른 개체"(rarity-design 7절) — 도감도 최대 크기를 폼별로 센다.
    // 종 단위로 재면 일반 42cm 때문에 변이 30cm가 배지를 못 받아, 남길 판단 기준과 어긋난다.
    seed({ bag: [
      inst('carp', 'normal', 42), inst('carp', 'normal', 8),
      inst('carp', 'variant', 30), inst('carp', 'variant', 5),
    ] });
    render(<App />);
    clickTab(/^가방/);
    expect(screen.getAllByText('최대')).toHaveLength(2); // 일반 42 + 변이 30
  });

  it('변이는 별도 행이 아니라 같은 행의 배지 — 소계는 폼별 가격 합', () => {
    // 잉어 30G + 금빛 잉어 60G(변이 ×2) = 한 행, 소계 90G
    seed({ bag: [inst('carp', 'normal', 20), inst('carp', 'variant', 35)] });
    render(<App />);
    clickTab(/^가방/);
    expect(screen.getByText('잉어')).toBeInTheDocument();
    expect(screen.queryByText('금빛 잉어')).not.toBeInTheDocument(); // 행이 갈리지 않는다
    expect(screen.getByText('×2')).toBeInTheDocument();
    expect(screen.getAllByText('90G')).toHaveLength(2); // 행 소계 + 하단 판매 가능 합
    expect(screen.getByText('변이')).toBeInTheDocument();            // 개체 줄의 배지
    expect(screen.getAllByText('최대')).toHaveLength(2);             // 최대는 폼별 — 일반·변이 각각
  });

  it('변이만 골라 파는 것도 개체 단위로 된다', () => {
    seed({ bag: [inst('carp', 'normal', 20), inst('carp', 'variant', 35)] });
    render(<App />);
    clickFurniture('sell');
    expect(screen.getByText(/판매하기 \(\+90G\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('20.0cm').closest('[role="button"]')!); // 일반 제외
    fireEvent.click(screen.getByText(/판매하기 \(\+60G\)/));                // 변이만
    expect(hud()).toContain('골드 60G');
  });

  it('카드뷰는 보유 마릿수만 보이고, 안 잡은 종은 도감처럼 ???', () => {
    // 잉어 = 보유중 · 붕어 = 잡아봤지만 지금은 없음 · 나머지 = 미발견
    seed({ bag: [inst('carp'), inst('carp'), inst('carp', 'variant')],
           dex: { carp: { normal: rec(2), variant: rec(1) }, crucian: { normal: rec(5) } } });
    render(<App />);
    clickTab(/가방\s*\(목록\)/);
    clickTab(/가방\s*\(목록\)/); // 활성 가방 탭 재클릭 → 카드뷰 (도감과 같은 규약)
    expect(screen.getByLabelText('잉어 일반 2마리 변이 1마리 보유')).toBeInTheDocument();
    expect(screen.getAllByText('???').length).toBeGreaterThan(0); // 미발견 종
    expect(screen.queryByText('30G')).not.toBeInTheDocument();    // 카드엔 값을 안 건다

    // 일반/변이가 한 행 — 흰 글씨 일반, 보라 변이 (행을 둘로 쓰면 카드 높이가 종마다 달라진다)
    const card = screen.getByLabelText('잉어 일반 2마리 변이 1마리 보유');
    const [normal, variant] = [...card.querySelectorAll('span > span')]
      .filter(e => e.textContent?.trim());
    expect(normal.textContent).toBe('2');
    expect(normal.className).toContain('text-text');
    expect(variant.textContent).toBe('1');
    expect(variant.className).toContain('text-epic');

    // 안 들고 있는 종은 마릿수 줄 자체가 없다 — 가방은 보유 현황만 본다
    const empty = screen.getByLabelText('붕어 미보유');
    expect(empty.textContent).toBe('붕어');
  });

  it('카드뷰 정렬: 보유중 → 발견함 → 미발견, 무리 안에서는 도감 순', () => {
    // 잉어(pond/rare)만 보유, 붕어(pond/common)는 발견만, 나머지는 미발견.
    // 도감 순이면 붕어가 잉어보다 앞이라, 보유 무리가 먼저 오는지로 두 규칙이 갈린다.
    seed({
      bag: [inst('carp')],
      dex: { carp: { normal: rec(1) }, crucian: { normal: rec(3) } },
    });
    render(<App />);
    clickTab(/가방\s*\(목록\)/);
    clickTab(/가방\s*\(목록\)/);
    const names = screen.getAllByText(/^(잉어|붕어|\?\?\?)$/).map(e => e.textContent);
    expect(names.slice(0, 3)).toEqual(['잉어', '붕어', '???']); // 보유 → 발견 → 미발견
  });

  it('접은 행은 탭을 옮겼다 와도 접힌 채다', () => {
    seed({ bag: [inst('carp', 'normal', 40)] });
    render(<App />);
    clickTab(/^가방/);
    fireEvent.click(screen.getByLabelText('잉어 개체 접기'));
    expect(screen.queryByText('40.0cm')).not.toBeInTheDocument();
    clickTab(/도감\s*\(일반\)/);
    clickTab(/^가방/);
    expect(screen.queryByText('40.0cm')).not.toBeInTheDocument(); // 전역 저장 — 안 잊는다
  });

  it('개체 하나만 잠그면 같은 종의 나머지는 팔린다', () => {
    seed({ bag: [inst('carp', 'normal', 40), inst('carp', 'normal', 10)] });
    render(<App />);
    clickTab(/^가방/);
    fireEvent.click(screen.getByLabelText('40.0cm 잉어 잠금')); // 큰 놈만 자물쇠
    clickFurniture('sell');
    fireEvent.click(screen.getByText(/판매하기 \(\+30G\)/)); // 작은 놈 1마리만
    expect(hud()).toContain('골드 30G');
    expect(hud()).toContain('1마리');
  });

  it('잠금 해제하면 다시 판매 대상', () => {
    seed({ bag: [inst('carp', 'normal', null, true)] });
    render(<App />);
    clickTab(/^가방/);
    fireEvent.click(screen.getByLabelText('잉어 전체 잠금 해제')); // 🔓
    clickFurniture('sell');
    fireEvent.click(screen.getByText(/판매하기 \(\+30G\)/));
    expect(hud()).toContain('골드 30G');
    expect(hud()).toContain('0마리');
  });

  it('자동 잠금 — 어종×폼별 최대 개체를 한 번에 잠그고 나머지는 그대로 둔다', () => {
    seed({ bag: [
      inst('crucian', 'normal', 12), inst('crucian', 'normal', 40),
      inst('crucian', 'variant', 55),
      inst('carp', 'normal', 33),
    ] });
    render(<App />);
    clickTab(/^가방/);
    expect(screen.getByLabelText('자동 잠금')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('자동 잠금'));
    // 각 그룹의 최대만 잠긴다 — 라벨에 크기가 있어 개체를 정확히 지목할 수 있다
    expect(screen.getByLabelText('40.0cm 붕어 잠금 해제')).toBeInTheDocument();
    expect(screen.getByLabelText('55.0cm 변이 붕어 잠금 해제')).toBeInTheDocument();
    expect(screen.getByLabelText('33.0cm 잉어 잠금 해제')).toBeInTheDocument();
    // 최대가 아닌 것은 건드리지 않는다
    expect(screen.getByLabelText('12.0cm 붕어 잠금')).toBeInTheDocument();

    // 다시 누르면 변할 게 없다 — 요청 없이 안내만 (멱등)
    fireEvent.click(screen.getByLabelText('자동 잠금'));
    expect(screen.getByText(/새로 잠글 최대 개체가 없다/)).toBeInTheDocument();
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
    expect(screen.queryByText('관리자')).not.toBeInTheDocument();
    clickTab('설정');
    expect(screen.queryByText(/관리자 대시보드/)).not.toBeInTheDocument();
  });

  it('?admin이면 전체 게임 데이터 열람 가능(숨긴 어종 포함)', () => {
    window.history.replaceState({}, '', '/?admin=1');
    render(<App />);
    clickTab('관리자');
    expect(screen.getAllByText('크라켄').length).toBeGreaterThan(0); // 안 잡아도 보임 (도감+추첨 표)
    expect(screen.getAllByText('2000G').length).toBeGreaterThan(0); // 크라켄 가격(+돛단배)
    expect(screen.getByText('perfect')).toBeInTheDocument();
    window.history.replaceState({}, '', '/');
  });
});

describe('스탯창 — 자원 바 클릭 진입 (v0.6.1)', () => {
  it('클릭하면 열리고 파생 축·수역 캐루셀이 보인다, 닫기로 닫힌다', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('스탯창 열기'));
    expect(screen.getByText('스탯')).toBeInTheDocument(); // Panel 프레임 제목
    expect(screen.getByText('이동 속도')).toBeInTheDocument();
    // 낚싯대: 레벨/파워 + 수역 캐루셔(기본 = 현재 지역 대표 수역)의 상대 스탯 행들
    expect(screen.getByText('현재 레벨')).toBeInTheDocument();
    expect(screen.getByText('현재 파워')).toBeInTheDocument();
    expect(screen.getAllByText(/마을 강/).length).toBeGreaterThan(0); // village 최고 요구 수역
    expect(screen.getByText('입질 최소 대기')).toBeInTheDocument();
    expect(screen.getByText('바 시간')).toBeInTheDocument();
    expect(screen.getByText('방치 낚시 페널티')).toBeInTheDocument();
    // 캐루셀 순환 — 다음 수역(마을 연못)으로 넘어간다
    fireEvent.click(screen.getByLabelText('다음 수역'));
    expect(screen.getAllByText(/마을 연못/).length).toBeGreaterThan(0);
    // 호버 도움말 — 게임 스타일 버블(title 툴팁 아님), 로어체 문장
    fireEvent.mouseEnter(screen.getAllByLabelText('도움말')[0]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('요구하는 파워가 달라서');
    fireEvent.mouseLeave(screen.getAllByLabelText('도움말')[0]);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('닫기'));
    expect(screen.queryByText('파워')).not.toBeInTheDocument();
  });

  it('씬이 바뀌면 스탯창도 닫힌다', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('스탯창 열기'));
    expect(screen.getByText('스탯')).toBeInTheDocument();
    // 집 문 → 마을 이동(go) — 모달이 열린 채로 씬 전환
    clickFurniture('exit');
    expect(screen.queryByText('이동 속도')).not.toBeInTheDocument();
  });
});

describe('아이템 · 미끼 — 가방 2섹션 + 필드 오버레이', () => {
  const COMMON = 'bait-common';

  it('가방 탭은 물고기/아이템 두 섹션이고, 미끼 활성 토글이 배타적으로 동작한다', async () => {
    seed({ items: { [COMMON]: 2, 'bait-rare': 1 } });
    render(<App />);
    clickTab(/^가방/);
    expect(screen.getByText('아이템')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /물고기 \(0\/60마리/ })).toBeInTheDocument(); // 맨발 기본 상한

    // 보유 없는 미끼는 애초에 누를 수 없다
    expect(screen.getByLabelText('전설 미끼 활성화')).toBeDisabled();
    // 일반 활성 → 사용 중 전환
    fireEvent.click(screen.getByLabelText('일반 미끼 활성화'));
    await waitFor(() => expect(screen.getByLabelText('일반 미끼 비활성화')).toBeInTheDocument());
    // 다른 미끼로 교체하면 이전 것은 꺼진다 (4중 1)
    fireEvent.click(screen.getByLabelText('희귀 미끼 활성화'));
    await waitFor(() => expect(screen.getByLabelText('희귀 미끼 비활성화')).toBeInTheDocument());
    expect(screen.getByLabelText('일반 미끼 활성화')).toBeInTheDocument();
  });

  it('필드 오버레이 — 활성 미끼와 남은 개수를 보여주고, 소진돼도 자리를 지킨다. 미활성이면 없다', () => {
    renderField('village', V_SPAWN, { items: { [COMMON]: 7 }, activeBait: COMMON });
    const overlay = screen.getByLabelText('활성 미끼');
    expect(overlay).toHaveTextContent('7');
    cleanup();

    renderField('village', V_SPAWN, { items: {}, activeBait: COMMON });
    expect(screen.getByLabelText('활성 미끼')).toHaveTextContent('0');
    cleanup();

    renderField('village', V_SPAWN, {});
    expect(screen.queryByLabelText('활성 미끼')).not.toBeInTheDocument();
  });
});