import { describe, it, expect } from 'vitest';
import { followTarget, LIVE_MAX_LENGTH, parseClientMessage } from './live';

describe('parseClientMessage', () => {
  it('정상 메시지는 필요한 필드만 남긴다', () => {
    expect(parseClientMessage('{"t":"move","region":"sea","x":1.5,"y":-2,"dir":3,"line":true,"extra":1}'))
      .toEqual({ t: 'move', region: 'sea', x: 1.5, y: -2, dir: 3, line: true });
    expect(parseClientMessage('{"t":"stop"}')).toEqual({ t: 'stop' });
    expect(parseClientMessage('{"t":"ping"}')).toEqual({ t: 'ping' });
    expect(parseClientMessage('{"t":"chat","text":"안녕"}')).toEqual({ t: 'chat', text: '안녕' });
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
      '{"t":"chat","text":5}',
    ]) expect(parseClientMessage(raw), raw).toBeNull();
  });

  it('크기 상한을 넘으면 null', () => {
    const text = 'a'.repeat(LIVE_MAX_LENGTH);
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text }))).toBeNull();
  });
});

describe('followTarget', () => {
  it('송신 주기 안에 목표까지 대부분 다가가고 넘어서지 않는다', () => {
    let p = { x: 0, y: 0 };
    for (let i = 0; i < 6; i++) p = followTarget(p, { x: 10, y: 0 }, 16);
    expect(p.x).toBeGreaterThan(7.5);
    expect(p.x).toBeLessThan(10);
  });

  it('간격이 0이면 그대로이고, 멀리 떨어진 목표는 바로 옮긴다', () => {
    expect(followTarget({ x: 1, y: 1 }, { x: 5, y: 5 }, 0)).toEqual({ x: 1, y: 1 });
    expect(followTarget({ x: 0, y: 0 }, { x: 500, y: 0 }, 16)).toEqual({ x: 500, y: 0 });
  });
});
