// 서버의 403(제재 계정, 권한 없는 import 요청)은 거부 사유 코드와 무관하게 restricted 실패로 올라간다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors';

vi.mock('./auth', () => ({ isCloud: true }));
vi.mock('./me', () => ({ readMe: async () => null }));

import { HttpGameGateway } from './httpGameGateway';

afterEach(() => { vi.unstubAllGlobals(); });

describe('HttpGameGateway의 import 거부', () => {
  it.each(['import-owner-only', 'import-disabled'])('403 %s는 restricted 실패로 던진다', async code => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: code }), {
      status: 403, headers: { 'content-type': 'application/json' },
    }));
    const err = await new HttpGameGateway().dispatch({ type: 'import', save: {} }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe('restricted');
  });
});

describe('HttpGameGateway의 게스트 거부', () => {
  it.each([['guest-village-only'], ['account-only']] as const)('403 %s는 같은 이름의 실패 종류로 던진다', async code => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: code }), {
      status: 403, headers: { 'content-type': 'application/json' },
    }));
    const err = await new HttpGameGateway().dispatch({ type: 'travel', to: { kind: 'region', id: 'world' } }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe(code);
  });
});
