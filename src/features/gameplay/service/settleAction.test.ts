// 서버가 게스트 요청을 거부하면 오류 정책의 문구가 메시지 창에 한 줄로 알릴 안내가 된다.
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../core/errors';
import { settleAction } from './useGame';

describe('settleAction 게스트 거부', () => {
  it('마을 밖 이동 거부(guest-village-only)는 바다로 나가려면 태평양 항로를 열어야 한다는 안내가 된다', async () => {
    const settled = await settleAction(() => { throw new AppError('guest-village-only', 'guest rejected'); });
    expect(settled).toEqual({ ok: false, notice: '바다로 나가려면 태평양 항로를 열어야 해요.' });
  });

  it('허용 목록 밖 기능 거부(account-only)는 태평양 항로 해금 안내가 된다', async () => {
    const settled = await settleAction(() => { throw new AppError('account-only', 'guest rejected'); });
    expect(settled).toEqual({ ok: false, notice: '태평양 항로가 열리면 쓸 수 있어요.' });
  });

  it('메시지 창 오류 자리 또는 전체 모달로 알리는 종류(restricted, rate-limited, bug, consent-required)는 호출부에 따로 알릴 문구를 주지 않는다', async () => {
    for (const kind of ['restricted', 'rate-limited', 'bug', 'consent-required'] as const) {
      const settled = await settleAction(() => { throw new AppError(kind, 'x'); });
      expect(settled, kind).toEqual({ ok: false, notice: null });
    }
  });
});
