import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import GoogleLogo from './GoogleLogo';

// 구글로 계속하는 버튼 — 구글 브랜딩 가이드라인의 Light 테마 버튼이다. 게임의 픽셀 베벨과 색 토큰을 적용하지 않는다.
// 높이 40, 모서리 4, 흰 바탕에 #747775 테두리와 #1F1F1F 글자, 로고 20(왼쪽 여백 12, 로고와 글자 사이 10, 오른쪽 여백 12).
// 폭은 놓인 칸을 채운다. 로고는 왼쪽 여백을 지켜 왼쪽 끝에 두고 글자는 남은 자리의 가운데에 둔다.
// 호버와 눌림은 가이드라인의 상태 겹침(#303030 8%, 12%)을 쓰고, 비활성은 38% 불투명이다.
export default function GoogleButton({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button"
            className={cx(
              'flex w-full h-10 items-center px-3 rounded-[4px] border border-[#747775] bg-white text-[#1F1F1F] cursor-pointer',
              "font-[system-ui,-apple-system,'Segoe_UI',Roboto,Arial,sans-serif] text-sm font-medium leading-5 tracking-[0.25px]",
              'hover:bg-[color-mix(in_srgb,#303030_8%,white)] active:bg-[color-mix(in_srgb,#303030_12%,white)]',
              'disabled:cursor-default disabled:bg-white/38 disabled:border-[#1F1F1F]/12 disabled:text-[#1F1F1F]/38',
              className)}
            {...props}>
      <GoogleLogo className="mr-2.5" />
      <span className="flex-1 text-center whitespace-nowrap truncate">{children}</span>
    </button>
  );
}
