// HUD 스토리 공용 표본 — 메시지 기록, 실시간 채널 응답, 수배판 응답. 스토리에서만 쓴다.
import { http, HttpResponse, ws } from 'msw';
import { useLive } from '../../../features/live/service/useLive';
import { LIVE_PATH } from '../../../game/rules/live';
import type { ChatLine, Presence, ServerMessage } from '../../../game/rules/live';
import { createMessage } from '../../ui/hud/messageFeed';
import type { Msg } from '../../ui/hud/messageFeed';

export const ME = 'u-me';

const at = (hh: number, mm: number) => new Date(2026, 10, 5, hh, mm);

/** 시스템과 월드 채팅, 길드 채팅이 섞인 기록 */
export const MIXED_LOG: Msg[] = [
  createMessage(1, '바다에 나왔어요. 어군을 찾아 낚시해 보세요.', { now: at(21, 40) }),
  createMessage(2, '해구 입구에 네임드 흔적 떴어요', { channel: 'chat', author: '바다사나이', now: at(21, 41), from: { uid: 'u-1', chatId: 11 } }),
  createMessage(3, '희귀 등급 [청새치] 획득!', { tone: 'gold', now: at(21, 41) }),
  createMessage(4, '어디쯤이에요?', { channel: 'chat', author: '바다거북', now: at(21, 42), from: { uid: ME, chatId: 12 } }),
  createMessage(5, '기부 고마워요. 판매가 보너스 2단계 됐어요', { channel: 'guild', author: '밤낚시꾼', now: at(21, 42), from: { uid: 'u-2', chatId: 13 } }),
  createMessage(6, '마리아나 해구 입구 쪽이요', { channel: 'chat', author: '청새치사냥', now: at(21, 43), from: { uid: 'u-3', chatId: 14 } }),
  createMessage(7, '가방이 가득 찼어요. 항구에서 팔아 주세요.', { tone: 'warn', now: at(21, 43) }),
  createMessage(8, '오늘 저녁에 같이 토벌 가요', { channel: 'chat', author: '바다거북', now: at(21, 44), from: { uid: ME, chatId: 15 } }),
];

/** 시스템 기록만 */
export const SYSTEM_LOG: Msg[] = MIXED_LOG.filter(m => m.channel === 'system');

const presence = (uid: string, nick: string): Presence =>
  ({ uid, nick, boat: 2, region: 'world', zone: 'pacific', x: 400, y: 300, dir: 0, line: false });

/** 이 바다의 다른 플레이어 셋 */
export const OTHERS: Presence[] = [presence('u-1', '바다사나이'), presence('u-2', '밤낚시꾼'), presence('u-3', '청새치사냥')];

/** 실시간 채널 응답 — 접속하면 hello(다른 플레이어와 최근 채팅)를 보내고, 이어서 extra를 보낸다 */
export function liveHandler(opts: { others?: Presence[]; chat?: ChatLine[]; extra?: ServerMessage[] } = {}) {
  const link = ws.link(new RegExp(`${LIVE_PATH}$`));
  return link.addEventListener('connection', ({ client }) => {
    const hello: ServerMessage = { t: 'hello', you: ME, others: opts.others ?? [], recentChat: opts.chat ?? [] };
    client.send(JSON.stringify(hello));
    for (const msg of opts.extra ?? []) client.send(JSON.stringify(msg));
  });
}

/** 게임 화면처럼 실시간 채널을 연다. 그리는 것은 없다 */
export function LiveFeed(): null {
  useLive();
  return null;
}

/** 수배판 응답 — 오늘 진행 중인 의뢰와 도전권. 둘 다 비우면 흔적 카드가 없다 */
export function bountyHandler(opts: {
  progress?: { quest_id: string; progress: number }[];
  tickets?: { quest_id: string; issuedMinutesAgo: number }[];
  clears?: { kind: string }[];
} = {}) {
  return http.get('/api/me', ({ request }) => {
    if (new URL(request.url).searchParams.get('q') !== 'bounty') return undefined;
    const now = Date.now();
    return HttpResponse.json({
      clears: (opts.clears ?? []).map(c => ({ kind: c.kind, cleared_at: new Date(now).toISOString() })),
      progress: (opts.progress ?? []).map(p => ({ ...p, started_at: new Date(now).toISOString() })),
      tickets: (opts.tickets ?? []).map(t => ({ quest_id: t.quest_id, issued_at: new Date(now - t.issuedMinutesAgo * 60_000).toISOString() })),
    });
  });
}

/** 지금 시각의 정시에서 minute분 — 게임 하루가 실제 60분이라 분이 낮과 밤을 정한다. 수배판 응답과 같은 기준 시각이다 */
export function clockAt(minute: number): string {
  const d = new Date();
  d.setUTCMinutes(minute, 0, 0);
  return d.toISOString();
}

/** 네임드 의뢰 하나(태평양 메갈로돈) */
export const NAMED_QUEST = 'pacific-named-megalodon';
