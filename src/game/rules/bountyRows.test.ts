// 수배 표 행의 오늘 기준 판정 — 의뢰 만료와 하루 클리어 횟수.
// 서버(주입 진실)와 클라이언트(수배판 스냅샷)가 같은 함수를 쓰므로 경계 동작을 여기서 고정한다.
import { describe, expect, it } from 'vitest';
import { clearsOf, splitQuestRows } from './bountyRows';
import { gameDayStartISO } from './time';

// 기준 시각 2026-10-19 12:00 KST — 그날의 시작은 04:00 KST = 2026-10-18T19:00:00Z
const START = gameDayStartISO('2026-10-19T03:00:00.000Z');
const BEFORE = '2026-10-18T18:59:59.999Z'; // 03:59:59.999 KST — 전날
const EASY = 'pacific-easy-common'; // 수량 250
const NAMED = 'pacific-named-megalodon'; // 수량 1
const row = (questId: string, progress: number, startedAt: string) => ({ questId, progress, startedAt });

describe('splitQuestRows — 날이 바뀌며 마치지 못한 의뢰는 만료된다', () => {
  it('기준이 되는 하루의 시작은 KST 04:00이다', () => {
    expect(START).toBe('2026-10-18T19:00:00.000Z');
  });

  it('04:00 정각 이후에 수주한 의뢰는 진행도와 무관하게 유효하다', () => {
    const { live, expired } = splitQuestRows([row(EASY, 0, START), row(NAMED, 0, '2026-10-19T02:00:00.000Z')], START);
    expect(live.map(r => r.questId)).toEqual([EASY, NAMED]);
    expect(expired).toEqual([]);
  });

  it('03:59:59.999에 수주한 의뢰는 전날 것이라 수량 미달이면 만료다 — 04:00 정각과 1ms 차이로 갈린다', () => {
    const { live, expired } = splitQuestRows([row(EASY, 249, BEFORE), row(NAMED, 0, BEFORE)], START);
    expect(live).toEqual([]);
    expect(expired.map(r => r.questId)).toEqual([EASY, NAMED]);
  });

  it('경계 이전에 수주했어도 수량을 채운 의뢰는 유효하다 — 보상을 받을 수 있다', () => {
    const { live, expired } = splitQuestRows([row(EASY, 250, BEFORE), row(NAMED, 1, '2026-10-10T00:00:00.000Z')], START);
    expect(live.map(r => r.questId)).toEqual([EASY, NAMED]);
    expect(expired).toEqual([]);
  });

  it('수량을 넘겨 채운 의뢰도 마친 것으로 센다', () => {
    expect(splitQuestRows([row(EASY, 300, BEFORE)], START).live).toHaveLength(1);
  });

  it('등록되지 않은 의뢰의 행은 어느 쪽에도 넣지 않는다', () => {
    const { live, expired } = splitQuestRows([row('nope', 5, START), row('nope-2', 5, BEFORE)], START);
    expect(live).toEqual([]);
    expect(expired).toEqual([]);
  });

  it('시각 표기가 달라도(+00:00과 Z) 같은 순간으로 비교한다', () => {
    // Postgres JSON 직렬화 형식은 +00:00이다 — 04:00 정각 행이 문자열 비교로 전날 취급되면 안 된다
    const { live } = splitQuestRows([row(EASY, 0, '2026-10-18T19:00:00+00:00')], START);
    expect(live).toHaveLength(1);
    const { expired } = splitQuestRows([row(EASY, 0, '2026-10-18T18:59:59.999+00:00')], START);
    expect(expired).toHaveLength(1);
  });

  it('행의 나머지 필드를 그대로 돌려준다', () => {
    const extra = { ...row(EASY, 3, START), updatedAt: 'x' };
    expect(splitQuestRows([extra], START).live[0]).toBe(extra);
  });
});

describe('clearsOf — 오늘 클리어 횟수를 갈래별로 센다', () => {
  const clear = (kind: string, clearedAt: string) => ({ kind, clearedAt });

  it('경계 이후의 클리어만 센다 — 04:00 정각은 오늘, 1ms 전은 어제다', () => {
    expect(clearsOf([
      clear('general', START), clear('general', BEFORE), clear('named', '2026-10-19T02:00:00.000Z'),
    ], START)).toEqual({ general: 1, named: 1 });
  });

  it('같은 갈래를 여러 번 클리어한 기록은 그만큼 센다', () => {
    expect(clearsOf([clear('general', START), clear('general', '2026-10-19T01:00:00.000Z')], START))
      .toEqual({ general: 2, named: 0 });
  });

  it('기록이 없으면 0이고, 모르는 갈래는 세지 않는다', () => {
    expect(clearsOf([], START)).toEqual({ general: 0, named: 0 });
    expect(clearsOf([clear('other', START)], START)).toEqual({ general: 0, named: 0 });
  });

  it('시각 표기가 달라도 같은 순간으로 비교한다', () => {
    expect(clearsOf([clear('general', '2026-10-18T19:00:00+00:00')], START)).toEqual({ general: 1, named: 0 });
  });
});
