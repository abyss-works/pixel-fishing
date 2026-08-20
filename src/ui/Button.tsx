import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'facility';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  active?: boolean;
}

// 픽셀 베벨 버튼 — variant로 위계 구분(정비 확정=primary, 시설 그리드=facility, 보조=ghost)
export default function Button({ variant = 'default', active, className = '', ...props }: ButtonProps) {
  const cls = ['pf-btn', variant !== 'default' ? variant : '', active ? 'active' : '', className]
    .filter(Boolean).join(' ');
  return <button className={cls} {...props} />;
}
