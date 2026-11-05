import { describe, it, expect } from 'vitest';
import { LIVE_MAX_LENGTH, parseClientMessage } from './live';

describe('parseClientMessage', () => {
  it('정상 메시지는 필요한 필드만 남긴다', () => {
    expect(parseClientMessage('{"t":"move","x":1.5,"y":-2,"dir":3,"line":true,"extra":1}'))
      .toEqual({ t: 'move', x: 1.5, y: -2, dir: 3, line: true });
    expect(parseClientMessage('{"t":"stop"}')).toEqual({ t: 'stop' });
    expect(parseClientMessage('{"t":"ping"}')).toEqual({ t: 'ping' });
    expect(parseClientMessage('{"t":"chat","text":"안녕"}')).toEqual({ t: 'chat', text: '안녕' });
  });

  it('형식이 틀리면 null', () => {
    for (const raw of [
      'not json', 'null', '[]', '"move"', '{}', '{"t":"nope"}',
      '{"t":"move","x":1,"y":2,"dir":4,"line":false}',
      '{"t":"move","x":"1","y":2,"dir":0,"line":false}',
      '{"t":"move","x":1,"y":2,"dir":0}',
      '{"t":"move","x":1e999,"y":2,"dir":0,"line":false}',
      '{"t":"chat","text":5}',
    ]) expect(parseClientMessage(raw), raw).toBeNull();
  });

  it('크기 상한을 넘으면 null', () => {
    const text = 'a'.repeat(LIVE_MAX_LENGTH);
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text }))).toBeNull();
  });
});
