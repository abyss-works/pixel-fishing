// 관리자 화면의 계정 식별 표기 — 계정을 보이는 모든 자리가 이 표기를 쓴다.
// admin은 "닉네임(이메일)"과 짧은 uid를 적고 전체 uid를 title로 둔다.
// opHandle이 있는 비식별 투영(maintainer)은 이메일 빈칸('—')과 원본 user_id(title 포함)를 노출하지 않는다.
import { cx } from '../../ui/cx';
import { adminUserLabel, shortUid } from '../../../features/admin/model/adminViews';
import type { AdminIdentity } from '../../../features/admin/model/adminViews';

export default function UserIdentity({ user, inline = false, className }: {
  user: AdminIdentity;
  /** 한 줄로 적는다. 기본은 두 줄(표기 위, uid 아래)이다 */
  inline?: boolean;
  className?: string;
}) {
  const masked = Boolean(user.opHandle);
  const handle = masked ? user.opHandle! : shortUid(user.user_id);
  return (
    <span title={masked ? undefined : user.user_id}
          className={cx('min-w-0 text-xs', inline ? 'inline-flex items-baseline gap-1.5' : 'inline-flex flex-col', className)}>
      <span className="break-all">{adminUserLabel(user)}</span>
      <span className="pf-accent text-2xs text-text-dim select-text">{handle}</span>
    </span>
  );
}
