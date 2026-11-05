// 관리자 화면의 계정 식별 표기 — 계정을 보이는 모든 자리가 이 표기를 쓴다.
// "닉네임(이메일)"을 먼저 적고 짧은 uid를 덧붙인다. 전체 uid는 title로 보이고, uid 글자는 선택해 복사할 수 있다.
import { cx } from '../../ui/cx';
import { adminUserLabel, shortUid } from '../../../features/admin/model/adminViews';
import type { AdminIdentity } from '../../../features/admin/model/adminViews';

export default function UserIdentity({ user, inline = false, className }: {
  user: AdminIdentity;
  /** 한 줄로 적는다. 기본은 두 줄(표기 위, uid 아래)이다 */
  inline?: boolean;
  className?: string;
}) {
  return (
    <span title={user.user_id}
          className={cx('min-w-0 text-xs', inline ? 'inline-flex items-baseline gap-1.5' : 'inline-flex flex-col', className)}>
      <span className="break-all">{adminUserLabel(user)}</span>
      <span className="pf-accent text-2xs text-text-dim select-text">{shortUid(user.user_id)}</span>
    </span>
  );
}
