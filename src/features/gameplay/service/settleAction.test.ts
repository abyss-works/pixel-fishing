// 서버가 게스트 요청을 거부하면 오류 정책의 문구가 메시지 창에 한 줄로 알릴 안내가 된다.
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../core/errors';
import { settleAction } from './useGame';

describe('settleAction 게스트 거부', () => {
  it('마을 밖 이동 거부(guest-village-only)는 바다로 나가려면 계정을 연결하라는 안내가 된다', async () => {
    const settled = await settleAction(() => { throw new AppError('guest-village-only', 'guest rejected'); });
    expect(settled).toEqual({ ok: false, notice: '계정을 연결하면 바다로 나갈 수 있어요. 계정 관리에서 연결해 주세요.' });
  });

  it('허용 목록 밖 기능 거부(account-only)는 계정 연결 안내가 된다', async () => {
    const settled = await settleAction(() => { throw new AppError('account-only', 'guest rejected'); });
    expect(settled).toEqual({ ok: false, notice: '계정을 연결하면 쓸 수 있어요. 계정 관리에서 연결해 주세요.' });
  });
});
