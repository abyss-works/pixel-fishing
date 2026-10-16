import { describe, expect, it } from 'vitest';
import { devEnvOf } from './devEnv';

describe('개발 환경 판정', () => {
  it('운영 빌드는 배지가 없고 개발 도구가 제한된다', () => {
    expect(devEnvOf('production')).toEqual({ env: 'production', label: null, restricted: true });
  });

  it('알 수 없는 환경도 운영으로 본다 — 운영일 수 있으면 숨기고 막는다', () => {
    expect(devEnvOf('')).toMatchObject({ label: null, restricted: true });
    expect(devEnvOf('staging?')).toMatchObject({ label: null, restricted: true });
  });

  it('스테이징·개발·로컬 빌드는 이름을 붙이고 제한하지 않는다', () => {
    expect(devEnvOf('preview')).toMatchObject({ label: 'PREVIEW', restricted: false });
    expect(devEnvOf('development')).toMatchObject({ label: 'DEV BUILD', restricted: false });
    expect(devEnvOf('local')).toMatchObject({ label: 'LOCAL DEV', restricted: false });
  });
});
