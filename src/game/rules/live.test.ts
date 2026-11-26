import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  CHAT_DUPLICATE_WINDOW_MS, CHAT_MAX_LENGTH, CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS,
  GLOBAL_CHAT_COOLDOWN_MS, LIVE_MAX_LENGTH, LIVE_MOVE_MS, NOTICE_BODY_MAX, NOTICE_TITLE_MAX,
  chatRate, chatText, formatIdle, glidePosition, globalChatCooldown, idleSinceOf,
  isDuplicateChat, isNoticeActive, nextGlide, normalizeNoticeDraft, parseClientMessage,
  type ChatLine, type ChatRoom, type ClientMessage, type NoticeItem, type Presence, type ServerMessage,
} from './live';

describe('parseClientMessage', () => {
  it('낚싯줄을 드리웠으면 찌 위치를 함께 받고, 형식이 틀린 찌 위치는 메시지째 버린다', () => {
    expect(parseClientMessage('{"t":"move","region":"sea","x":1,"y":2,"dir":1,"line":true,"bob":{"x":40,"y":-5,"z":9}}'))
      .toEqual({ t: 'move', region: 'sea', x: 1, y: 2, dir: 1, line: true, bob: { x: 40, y: -5 } });
    expect(parseClientMessage('{"t":"move","region":"sea","x":1,"y":2,"dir":1,"line":true,"bob":{"x":"a","y":1}}')).toBeNull();
    expect(parseClientMessage('{"t":"move","region":"sea","x":1,"y":2,"dir":1,"line":true,"bob":null}'))
      .toEqual({ t: 'move', region: 'sea', x: 1, y: 2, dir: 1, line: true });
  });

  it('move의 외형은 검사해서 싣고, 잘못된 값은 기본 외형으로 바꾼다', () => {
    const base = '"t":"move","region":"sea","x":1,"y":2,"dir":1,"line":false';
    expect(parseClientMessage(`{${base},"look":{"shirt":3,"pants":4,"hat":"cap-red","x":1}}`))
      .toEqual({ t: 'move', region: 'sea', x: 1, y: 2, dir: 1, line: false, look: { shirt: 3, pants: 4, hat: 'cap-red' } });
    for (const look of ['{"shirt":12,"pants":0,"hat":null}', '{"shirt":0,"pants":0,"hat":"cap-x"}', '"bad"', '5', 'null']) {
      expect(parseClientMessage(`{${base},"look":${look}}`), look)
        .toMatchObject({ t: 'move', look: { shirt: 0, pants: 0, hat: null } });
    }
    expect(parseClientMessage(`{${base}}`)).not.toHaveProperty('look');
  });

  it('정상 메시지는 필요한 필드만 남긴다', () => {
    expect(parseClientMessage('{"t":"move","region":"sea","x":1.5,"y":-2,"dir":3,"line":true,"extra":1}'))
      .toEqual({ t: 'move', region: 'sea', x: 1.5, y: -2, dir: 3, line: true });
    expect(parseClientMessage('{"t":"stop"}')).toEqual({ t: 'stop' });
    expect(parseClientMessage('{"t":"ping"}')).toEqual({ t: 'ping' });
    expect(parseClientMessage('{"t":"typing","on":true}')).toEqual({ t: 'typing', on: true });
    expect(parseClientMessage('{"t":"chat","text":"안녕"}')).toEqual({ t: 'chat', text: '안녕' });
    expect(parseClientMessage('{"t":"chat","text":"안녕","room":"global"}')).toEqual({ t: 'chat', text: '안녕', room: 'global' });
    expect(parseClientMessage('{"t":"chat","text":"안녕","room":"local"}')).toEqual({ t: 'chat', text: '안녕', room: 'local' });
    expect(parseClientMessage('{"t":"chat","text":"안녕","room":"guild"}')).toEqual({ t: 'chat', text: '안녕', room: 'guild' });
    expect(parseClientMessage('{"t":"region","region":"pacific","extra":1}')).toEqual({ t: 'region', region: 'pacific' });
  });

  it('형식이 틀리면 null', () => {
    for (const raw of [
      'not json', 'null', '[]', '"move"', '{}', '{"t":"nope"}',
      '{"t":"move","region":"sea","x":1,"y":2,"dir":4,"line":false}',
      '{"t":"move","x":1,"y":2,"dir":0,"line":false}',
      '{"t":"move","region":"Bad Region","x":1,"y":2,"dir":0,"line":false}',
      '{"t":"move","x":"1","y":2,"dir":0,"line":false}',
      '{"t":"move","x":1,"y":2,"dir":0}',
      '{"t":"move","x":1e999,"y":2,"dir":0,"line":false}',
      '{"t":"region"}',
      '{"t":"region","region":""}',
      '{"t":"region","region":"Bad Region"}',
      `{"t":"region","region":"${'a'.repeat(33)}"}`,
      '{"t":"chat","text":5}',
      '{"t":"chat","text":"안녕","room":"world"}',
      '{"t":"chat","text":"안녕","room":1}',
      '{"t":"typing","on":"yes"}',
    ]) expect(parseClientMessage(raw), raw).toBeNull();
  });

  it('크기 상한을 넘으면 null', () => {
    const text = 'a'.repeat(LIVE_MAX_LENGTH);
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text }))).toBeNull();
  });
});

describe('glide', () => {
  it('송신 주기 동안 일정 속도로 움직이고, 주기가 지나면 목표에 머문다', () => {
    const g = nextGlide(nextGlide(null, { x: 0, y: 0 }, 0), { x: 10, y: 0 }, 1000);
    expect(glidePosition(g, 1000)).toEqual({ x: 0, y: 0 });
    expect(glidePosition(g, 1000 + LIVE_MOVE_MS / 2)).toEqual({ x: 5, y: 0 });
    expect(glidePosition(g, 1000 + LIVE_MOVE_MS * 3)).toEqual({ x: 10, y: 0 });
  });

  it('이동 중에 새 좌표가 오면 지금 위치에서 다시 출발하고, 먼 목표는 바로 옮긴다', () => {
    const g = nextGlide(nextGlide(null, { x: 0, y: 0 }, 0), { x: 10, y: 0 }, 0);
    const next = nextGlide(g, { x: 20, y: 0 }, LIVE_MOVE_MS / 2);
    expect(next.from).toEqual({ x: 5, y: 0 });
    expect(nextGlide(next, { x: 500, y: 0 }, LIVE_MOVE_MS)).toEqual({ from: { x: 500, y: 0 }, to: { x: 500, y: 0 }, at: LIVE_MOVE_MS });
  });
});

describe('chatText', () => {
  it('앞뒤 공백을 지운 1~100자만 받는다', () => {
    expect(chatText('  안녕  ')).toBe('안녕');
    expect(chatText('가'.repeat(CHAT_MAX_LENGTH))).toBe('가'.repeat(CHAT_MAX_LENGTH));
    expect(chatText(` ${'가'.repeat(CHAT_MAX_LENGTH)} `)).toBe('가'.repeat(CHAT_MAX_LENGTH));
    expect(chatText('가'.repeat(CHAT_MAX_LENGTH + 1))).toBeNull();
    expect(chatText('')).toBeNull();
    expect(chatText(' \n\t ')).toBeNull();
  });
});

describe('chatRate', () => {
  const full = (from: number) => Array.from({ length: CHAT_RATE_MAX }, (_, i) => from + i);

  it('10초 창 안에 25개까지 보내고 26번째는 거부한다', () => {
    expect(chatRate(full(0).slice(1), 100)).toEqual({ ok: true, window: [...full(0).slice(1), 100] });
    const r = chatRate(full(0), 100);
    expect(r.ok).toBe(false);
    expect(r.window).toEqual(full(0));
  });

  it('창 밖으로 밀려난 기록은 세지 않아 시간이 지나면 다시 허용한다', () => {
    const sent = full(0);
    expect(chatRate(sent, CHAT_RATE_WINDOW_MS - 1).ok).toBe(false);
    const r = chatRate(sent, CHAT_RATE_WINDOW_MS);
    expect(r.ok).toBe(true);
    expect(r.window).toEqual([...sent.slice(1), CHAT_RATE_WINDOW_MS]);
  });

  it('몰아서 빠르게 보내도 창 상한 안이면 막지 않는다', () => {
    let window: number[] = [];
    for (let i = 0; i < CHAT_RATE_MAX; i++) {
      const r = chatRate(window, 5);
      expect(r.ok).toBe(true);
      window = r.window;
    }
    expect(chatRate(window, 5).ok).toBe(false);
  });
});

describe('formatIdle', () => {
  it('1시간 미만은 mm:ss, 1시간 이상은 h:mm:ss로 쓴다', () => {
    expect(formatIdle(0)).toBe('00:00');
    expect(formatIdle(999)).toBe('00:00');
    expect(formatIdle(1000)).toBe('00:01');
    expect(formatIdle(59_999)).toBe('00:59');
    expect(formatIdle(600_000)).toBe('10:00');
    expect(formatIdle(3_599_999)).toBe('59:59');
    expect(formatIdle(3_600_000)).toBe('1:00:00');
    expect(formatIdle(36_000_000 + 125_000)).toBe('10:02:05');
  });

  it('음수와 유한하지 않은 값은 00:00으로 쓴다', () => {
    expect(formatIdle(-5000)).toBe('00:00');
    expect(formatIdle(Number.NaN)).toBe('00:00');
  });
});

describe('idleSinceOf', () => {
  const spot = { region: 'sea', x: 1, y: 2 };
  const held = { spot, since: 100 };
  it('낚싯줄이 없으면 센 적이 있어도 null이다', () => {
    expect(idleSinceOf(held, spot, false, 50, 500)).toBeNull();
    expect(idleSinceOf(null, spot, false, undefined, 500)).toBeNull();
  });
  it('낚싯줄이 있고 첫 결과 경과가 실려 오면 지금에서 경과를 뺀 시각부터 센다', () => {
    expect(idleSinceOf(null, spot, true, 300, 500)).toBe(200);
    expect(idleSinceOf({ spot, since: null }, spot, true, 0, 500)).toBe(500);
  });
  it('첫 결과 경과가 없으면 센 적이 없다', () => {
    expect(idleSinceOf(null, spot, true, undefined, 500)).toBeNull();
  });
  it('같은 자리에서 이어지는 던짐은 시작 시각을 유지한다', () => {
    expect(idleSinceOf(held, { ...spot }, true, 300, 500)).toBe(100);
    expect(idleSinceOf(held, spot, true, undefined, 500)).toBe(100);
  });
  it('위치나 지역이 바뀌면 새로 센다', () => {
    expect(idleSinceOf(held, { ...spot, x: 2 }, true, undefined, 500)).toBeNull();
    expect(idleSinceOf(held, { ...spot, region: 'deep' }, true, 40, 500)).toBe(460);
  });
});

describe('방치 시간 필드', () => {
  it('move의 idleMs는 0 이상의 유한한 수만 받는다', () => {
    const base = '{"t":"move","region":"sea","x":1,"y":2,"dir":1,"line":true';
    expect(parseClientMessage(`${base},"idleMs":5}`))
      .toEqual({ t: 'move', region: 'sea', x: 1, y: 2, dir: 1, line: true, idleMs: 5 });
    expect(parseClientMessage(`${base},"idleMs":-1}`)).toBeNull();
    expect(parseClientMessage(`${base},"idleMs":"5"}`)).toBeNull();
    expect(parseClientMessage(`${base}}`)).toEqual({ t: 'move', region: 'sea', x: 1, y: 2, dir: 1, line: true });
  });
});

describe('ServerMessage nick', () => {
  it('nick 메시지는 uid와 nick 문자열 필드를 가진다', () => {
    type NickMessage = Extract<ServerMessage, { t: 'nick' }>;
    expectTypeOf<NickMessage>().toEqualTypeOf<{ t: 'nick'; uid: string; nick: string }>();

    const msg: ServerMessage = { t: 'nick', uid: 'u-1', nick: '새닉네임' };
    expect(JSON.parse(JSON.stringify(msg))).toEqual({ t: 'nick', uid: 'u-1', nick: '새닉네임' });
  });
});

describe('globalChatCooldown', () => {
  it('직전 전체 채팅 시각이 없거나 10초 이상 지나면 허용한다', () => {
    expect(GLOBAL_CHAT_COOLDOWN_MS).toBe(10_000);
    expect(globalChatCooldown(null, 5000)).toEqual({ ok: true, retryAfterMs: 0 });
    expect(globalChatCooldown(undefined, 5000)).toEqual({ ok: true, retryAfterMs: 0 });
    expect(globalChatCooldown(0, GLOBAL_CHAT_COOLDOWN_MS)).toEqual({ ok: true, retryAfterMs: 0 });
    expect(globalChatCooldown(1000, 1000 + GLOBAL_CHAT_COOLDOWN_MS)).toEqual({ ok: true, retryAfterMs: 0 });
  });

  it('쿨다운 안이면 남은 시간을 최소 1ms로 돌려준다', () => {
    expect(globalChatCooldown(0, 0)).toEqual({ ok: false, retryAfterMs: GLOBAL_CHAT_COOLDOWN_MS });
    expect(globalChatCooldown(0, 4000)).toEqual({ ok: false, retryAfterMs: 6000 });
    expect(globalChatCooldown(1000, 1000 + GLOBAL_CHAT_COOLDOWN_MS - 1)).toEqual({ ok: false, retryAfterMs: 1 });
    expect(globalChatCooldown(1000, 1000 + GLOBAL_CHAT_COOLDOWN_MS - 0.3)).toEqual({ ok: false, retryAfterMs: 1 });
  });
});

describe('isDuplicateChat', () => {
  it('10초 이내에 트림 기준 같은 비어 있지 않은 문구면 중복으로 판정한다', () => {
    expect(CHAT_DUPLICATE_WINDOW_MS).toBe(10_000);
    expect(isDuplicateChat(null, '안녕', 5000)).toBe(false);
    expect(isDuplicateChat(undefined, '안녕', 5000)).toBe(false);
    expect(isDuplicateChat({ text: '안녕', at: 1000 }, '  안녕  ', 1000 + CHAT_DUPLICATE_WINDOW_MS - 1)).toBe(true);
    expect(isDuplicateChat({ text: '  안녕 ', at: 1000 }, '안녕', 5000)).toBe(true);
    expect(isDuplicateChat({ text: '안녕', at: 1000 }, '다른 말', 5000)).toBe(false);
    expect(isDuplicateChat({ text: '안녕', at: 1000 }, '안녕', 1000 + CHAT_DUPLICATE_WINDOW_MS)).toBe(false);
  });

  it('빈 문자열이나 공백만 있는 입력은 중복으로 판정하지 않는다', () => {
    expect(isDuplicateChat({ text: '', at: 1000 }, '', 2000)).toBe(false);
    expect(isDuplicateChat({ text: '   ', at: 1000 }, '  ', 2000)).toBe(false);
  });
});

describe('isNoticeActive', () => {
  it('시작 시각 이상이고 종료 시각 미만일 때만 활성이다', () => {
    const notice = { startsAt: '2026-11-26T10:00:00.000Z', endsAt: '2026-11-26T12:00:00.000Z' };
    const start = Date.parse(notice.startsAt);
    const end = Date.parse(notice.endsAt);

    expect(isNoticeActive(notice, start - 1)).toBe(false);
    expect(isNoticeActive(notice, start)).toBe(true);
    expect(isNoticeActive(notice, start + 60_000)).toBe(true);
    expect(isNoticeActive(notice, end - 1)).toBe(true);
    expect(isNoticeActive(notice, end)).toBe(false);
    expect(isNoticeActive(notice, end + 1)).toBe(false);
  });

  it('유효하지 않은 타임스탬프는 비활성이다', () => {
    expect(isNoticeActive({ startsAt: 'invalid', endsAt: '2026-11-26T12:00:00.000Z' }, Date.now())).toBe(false);
    expect(isNoticeActive({ startsAt: '2026-11-26T10:00:00.000Z', endsAt: '' }, Date.now())).toBe(false);
  });
});

describe('normalizeNoticeDraft', () => {
  const validWindow = { startsAt: '2026-11-26T10:00:00+09:00', endsAt: '2026-11-26T12:00:00+09:00' };

  it('제목과 본문을 트림하고 시작/종료 시각을 ISO 문자열로 정규화한다', () => {
    expect(NOTICE_TITLE_MAX).toBe(80);
    expect(NOTICE_BODY_MAX).toBe(600);
    expect(normalizeNoticeDraft({
      title: '  점검 안내  ',
      body: '  잠시 뒤 점검이 있습니다.  ',
      ...validWindow,
    })).toEqual({
      ok: true,
      draft: {
        title: '점검 안내',
        body: '잠시 뒤 점검이 있습니다.',
        startsAt: '2026-11-26T01:00:00.000Z',
        endsAt: '2026-11-26T03:00:00.000Z',
      },
    });
  });

  it('제목이 비었거나 상한을 넘으면 bad-title을 반환한다', () => {
    expect(normalizeNoticeDraft({ title: 123, body: '본문', ...validWindow })).toEqual({ ok: false, code: 'bad-title' });
    expect(normalizeNoticeDraft({ title: '   ', body: '본문', ...validWindow })).toEqual({ ok: false, code: 'bad-title' });
    expect(normalizeNoticeDraft({ title: '가'.repeat(NOTICE_TITLE_MAX), body: '본문', ...validWindow }).ok).toBe(true);
    expect(normalizeNoticeDraft({ title: '🐟'.repeat(NOTICE_TITLE_MAX), body: '본문', ...validWindow }).ok).toBe(true);
    expect(normalizeNoticeDraft({ title: '가'.repeat(NOTICE_TITLE_MAX + 1), body: '본문', ...validWindow }))
      .toEqual({ ok: false, code: 'bad-title' });
  });

  it('본문이 비었거나 상한을 넘으면 bad-body를 반환한다', () => {
    expect(normalizeNoticeDraft({ title: '제목', body: null, ...validWindow })).toEqual({ ok: false, code: 'bad-body' });
    expect(normalizeNoticeDraft({ title: '제목', body: ' \n ', ...validWindow })).toEqual({ ok: false, code: 'bad-body' });
    expect(normalizeNoticeDraft({ title: '제목', body: '가'.repeat(NOTICE_BODY_MAX), ...validWindow }).ok).toBe(true);
    expect(normalizeNoticeDraft({ title: '제목', body: '가'.repeat(NOTICE_BODY_MAX + 1), ...validWindow }))
      .toEqual({ ok: false, code: 'bad-body' });
  });

  it('기간이 잘못되었거나 시작이 종료 이상이면 bad-window를 반환한다', () => {
    expect(normalizeNoticeDraft({ title: '제목', body: '본문', startsAt: 'nope', endsAt: validWindow.endsAt }))
      .toEqual({ ok: false, code: 'bad-window' });
    expect(normalizeNoticeDraft({ title: '제목', body: '본문', startsAt: validWindow.startsAt, endsAt: '' }))
      .toEqual({ ok: false, code: 'bad-window' });
    expect(normalizeNoticeDraft({ title: '제목', body: '본문', startsAt: 1000, endsAt: 2000 }))
      .toEqual({ ok: false, code: 'bad-window' });
    expect(normalizeNoticeDraft({ title: '제목', body: '본문', startsAt: validWindow.startsAt, endsAt: validWindow.startsAt }))
      .toEqual({ ok: false, code: 'bad-window' });
    expect(normalizeNoticeDraft({ title: '제목', body: '본문', startsAt: validWindow.endsAt, endsAt: validWindow.startsAt }))
      .toEqual({ ok: false, code: 'bad-window' });
  });
});

describe('채팅 3채널·공지 프로토콜 타입 계약', () => {
  it('ClientMessage와 ServerMessage 확장이 명세와 일치한다', () => {
    expectTypeOf<ChatRoom>().toEqualTypeOf<'global' | 'local' | 'guild'>();
    expectTypeOf<NoticeItem>().toEqualTypeOf<{
      id: number;
      title: string;
      body: string;
      startsAt: string;
      endsAt: string;
      createdAt: string;
    }>();

    expectTypeOf<Extract<ClientMessage, { t: 'region' }>>().toEqualTypeOf<{ t: 'region'; region: string }>();
    expectTypeOf<Extract<ClientMessage, { t: 'chat' }>>().toEqualTypeOf<{ t: 'chat'; text: string; room?: ChatRoom }>();

    type HelloMsg = Extract<ServerMessage, { t: 'hello' }>;
    expectTypeOf<HelloMsg['recentLocalChat']>().toEqualTypeOf<ChatLine[] | undefined>();
    expectTypeOf<HelloMsg['notices']>().toEqualTypeOf<NoticeItem[] | undefined>();

    expectTypeOf<Extract<ServerMessage, { t: 'localHistory' }>>()
      .toEqualTypeOf<{ t: 'localHistory'; region: string; lines: ChatLine[] }>();
    expectTypeOf<Extract<ServerMessage, { t: 'notices' }>>()
      .toEqualTypeOf<{ t: 'notices'; notices: NoticeItem[] }>();
    expectTypeOf<Extract<ServerMessage, { t: 'chat' }>>()
      .toEqualTypeOf<{ t: 'chat'; line: ChatLine; room?: ChatRoom }>();
    expectTypeOf<Extract<ServerMessage, { t: 'error' }>>().toEqualTypeOf<{
      t: 'error';
      code: 'chat-guest' | 'chat-rate' | 'chat-length' | 'chat-restricted' | 'chat-no-guild' | 'chat-global-cooldown' | 'chat-duplicate';
      retryAfterMs?: number;
    }>();
  });
});

describe('Presence fame 필드 계약', () => {
  it('Presence는 필수 fame 숫자 필드를 포함한 접속자 정보를 가진다', () => {
    expectTypeOf<Presence>().toEqualTypeOf<{
      uid: string;
      nick: string;
      boat: number;
      fame: number;
      region: string;
      zone?: string | null;
      x: number;
      y: number;
      dir: 0 | 1 | 2 | 3;
      line: boolean;
      bob?: { x: number; y: number };
      look?: { shirt: number; pants: number; hat: string | null };
      idleMs?: number;
    }>();

    const presence: Presence = {
      uid: 'u-1',
      nick: '어부',
      boat: 3,
      fame: 1200,
      region: 'sea',
      x: 10,
      y: 20,
      dir: 1,
      line: false,
    };
    expect(JSON.parse(JSON.stringify(presence))).toEqual({
      uid: 'u-1',
      nick: '어부',
      boat: 3,
      fame: 1200,
      region: 'sea',
      x: 10,
      y: 20,
      dir: 1,
      line: false,
    });
  });
});
