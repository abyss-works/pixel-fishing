// 관리자 화면의 계정 식별 표기 — 계정을 보이는 모든 자리가 이 표기를 쓴다.
// 마우스 호버·포커스 시 대화형 식별 호버 카드가 열려 닉네임·이메일(admin 전용)·UUID 원클릭 복사를 제공한다.
import { useEffect, useRef, useState } from 'react';
import Button from '../../ui/Button';
import { cx } from '../../ui/cx';
import Tip from '../../ui/Tip';
import { adminUserLabel, shortUid } from '../../../features/admin/model/adminViews';
import type { AdminIdentity } from '../../../features/admin/model/adminViews';

type CopyField = 'nickname' | 'email' | 'uuid';

function IdentityHoverCard({ user, masked }: { user: AdminIdentity; masked: boolean }) {
  const [copied, setCopied] = useState<CopyField | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  const copy = (field: CopyField, value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(field);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setCopied(null);
    }, 1200);
  };

  const nickname = user.nickname ?? '이름 없음';

  return (
    <div className="flex min-w-[220px] flex-col gap-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-text-dim shrink-0">닉네임</span>
        <span className="min-w-0 truncate text-text">{nickname}</span>
        <Button
          size="xs"
          variant="ghost"
          onClick={e => { e.stopPropagation(); copy('nickname', nickname); }}
        >
          {copied === 'nickname' ? '복사됨' : '복사'}
        </Button>
      </div>
      {user.email && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-text-dim shrink-0">이메일</span>
          <span className="min-w-0 truncate text-text">{user.email}</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={e => { e.stopPropagation(); copy('email', user.email!); }}
          >
            {copied === 'email' ? '복사됨' : '복사'}
          </Button>
        </div>
      )}
      {!masked && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-text-dim shrink-0">UUID</span>
          <span className="pf-accent min-w-0 truncate text-2xs text-gold">{user.user_id}</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={e => { e.stopPropagation(); copy('uuid', user.user_id); }}
          >
            {copied === 'uuid' ? '복사됨' : '복사'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function UserIdentity({ user, inline = false, className }: {
  user: AdminIdentity;
  /** 한 줄로 적는다. 기본은 두 줄(표기 위, uid 아래)이다 */
  inline?: boolean;
  className?: string;
}) {
  const masked = Boolean(user.opHandle);
  const handle = masked ? user.opHandle! : shortUid(user.user_id);
  return (
    <Tip interactive plain text={<IdentityHoverCard user={user} masked={masked} />}>
      <span title={masked ? undefined : user.user_id}
            className={cx('min-w-0 text-xs', inline ? 'inline-flex items-baseline gap-1.5' : 'inline-flex flex-col', className)}>
        <span className="break-all">{adminUserLabel(user)}</span>
        <span className="pf-accent text-2xs text-text-dim select-text">{handle}</span>
      </span>
    </Tip>
  );
}
