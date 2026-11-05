// 채팅 줄을 HUD 메시지 창의 글줄로 바꾼다. 시각은 서버가 저장한 시각이다.
import type { ChatLine } from '../../../../game/rules/live';
import { createMessage } from '../../../ui/hud/messageFeed';
import type { Msg } from '../../../ui/hud/messageFeed';

export const chatMessages = (lines: readonly ChatLine[]): Msg[] => lines.map(l =>
  createMessage(l.id, l.text, { channel: 'chat', author: l.nick, now: new Date(l.at), from: { uid: l.uid, chatId: l.id } }));
