import { describe, expect, it } from 'vitest';
import { parseOptions } from './options';
import { PROD_HOST } from './plan';

const base = ['--target', 'https://stage.example.dev', '--out', 'out', '--build-id', 'abc', '--accounts', 'acc.json'];

describe('parseOptions', () => {
  it('기본값을 채운다', () => {
    const o = parseOptions(base);
    expect(o.target).toBe('https://stage.example.dev');
    expect(o.steps).toEqual([10, 25, 50, 100]);
    expect(o.stepSeconds).toBe(120);
    expect(o.chatRate).toBe(1);
    expect(o.limits.errorRate).toBe(0.05);
    expect(o.limits.probeMs).toBe(1500);
    expect(o.probe).toBeNull();
    expect(o.metricsCmd).toBeNull();
  });

  it('target은 필수이고 기본값이 없다', () => {
    expect(() => parseOptions(['--out', 'out', '--build-id', 'abc', '--accounts', 'a'])).toThrow(/--target/);
  });

  it('out과 build-id는 필수다', () => {
    expect(() => parseOptions(['--target', 'https://stage.example.dev', '--build-id', 'abc', '--accounts', 'a'])).toThrow(/--out/);
    expect(() => parseOptions(['--target', 'https://stage.example.dev', '--out', 'out', '--accounts', 'a'])).toThrow(/--build-id/);
  });

  it('accounts는 필수다', () => {
    expect(() => parseOptions(['--target', 'https://stage.example.dev', '--out', 'out', '--build-id', 'abc'])).toThrow(/--accounts/);
  });

  it('운영 도메인 target은 거부한다', () => {
    expect(() => parseOptions(['--target', `https://${PROD_HOST}`, '--out', 'out', '--build-id', 'abc', '--accounts', 'a'])).toThrow(/운영/);
  });

  it('probe는 운영 도메인을 허용한다', () => {
    const o = parseOptions([...base, '--probe', `https://${PROD_HOST}/`]);
    expect(o.probe).toBe(`https://${PROD_HOST}`);
  });

  it('숫자 옵션을 읽는다', () => {
    const o = parseOptions([...base, '--steps', '2,5', '--step-seconds', '15', '--chat-rate', '0', '--idle-ratio', '0.5',
      '--abort-error-rate', '0.1', '--abort-probe-ms', '900']);
    expect(o.steps).toEqual([2, 5]);
    expect(o.stepSeconds).toBe(15);
    expect(o.chatRate).toBe(0);
    expect(o.idleRatio).toBe(0.5);
    expect(o.limits.errorRate).toBe(0.1);
    expect(o.limits.probeMs).toBe(900);
  });

  it.each([
    ['--step-seconds', '0'], ['--chat-rate', '-1'], ['--idle-ratio', '1.5'], ['--abort-error-rate', '2'], ['--abort-probe-ms', 'x'],
  ])('범위를 벗어난 %s %s는 거부한다', (flag, value) => {
    expect(() => parseOptions([...base, flag, value])).toThrow();
  });

  it('모르는 옵션은 거부한다', () => {
    expect(() => parseOptions([...base, '--unknown', '1'])).toThrow();
  });
});
