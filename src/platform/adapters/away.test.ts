// 자리 비움 — 떠난 시각을 저장소에 남기고 돌아오면 비운 시간을 한 번만 알린다. 결과는 서버 읽기 함수가 준다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ isCloud: true }));

import { AWAY_LEFT_KEY, readAwayReport, watchAway } from './away';

describe('readAwayReport', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('비운 시간을 붙여 요약을 읽는다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ catches: 3 }), { status: 200 }));
    await expect(readAwayReport(600_000)).resolves.toEqual({ catches: 3 });
    expect(fetchMock).toHaveBeenCalledWith('/api/away-report?awayMs=600000');
  });

  it('실패 응답은 오류로 던진다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'db-read' }), { status: 500 }));
    await expect(readAwayReport(600_000)).rejects.toMatchObject({ name: 'AppError', kind: 'network' });
  });
});

describe('watchAway', () => {
  let hidden = false;
  let focused = true;
  let now = 1_000_000;
  beforeEach(() => {
    localStorage.clear();
    hidden = false; focused = true; now = 1_000_000;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  const leave = () => { focused = false; window.dispatchEvent(new Event('blur')); };
  const comeBack = () => { focused = true; hidden = false; window.dispatchEvent(new Event('focus')); };

  it('포커스를 잃은 시각부터 돌아온 시각까지를 알린다', () => {
    const onReturn = vi.fn();
    const stop = watchAway(onReturn);
    leave();
    now += 5000;
    comeBack();
    expect(onReturn).toHaveBeenCalledWith(5000);
    stop();
  });

  it('같은 부재는 한 번만 알린다 — 포커스와 보임 신호가 함께 와도', () => {
    const onReturn = vi.fn();
    const stop = watchAway(onReturn);
    hidden = true; focused = false;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    now += 7000;
    comeBack();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onReturn).toHaveBeenCalledWith(7000);
    expect(localStorage.getItem(AWAY_LEFT_KEY)).toBeNull();
    stop();
  });

  it('보이지만 포커스가 없으면 아직 돌아온 것이 아니다', () => {
    const onReturn = vi.fn();
    const stop = watchAway(onReturn);
    leave();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onReturn).not.toHaveBeenCalled();
    stop();
  });

  it('새로고침 전에 남긴 떠난 시각은 시작할 때 처리한다', () => {
    localStorage.setItem(AWAY_LEFT_KEY, String(now - 60_000));
    const onReturn = vi.fn();
    const stop = watchAway(onReturn);
    expect(onReturn).toHaveBeenCalledWith(60_000);
    stop();
  });

  it('멈춘 뒤에는 신호를 받지 않는다', () => {
    const onReturn = vi.fn();
    watchAway(onReturn)();
    leave();
    now += 1000;
    comeBack();
    expect(onReturn).not.toHaveBeenCalled();
  });
});
