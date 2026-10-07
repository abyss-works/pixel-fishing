-- 롤백: 편지 뷰·테이블 제거. events의 원본 행은 events에 그대로 있다(letters는 사본).
drop view if exists public.v_admin_letters;
drop table if exists public.letters;
