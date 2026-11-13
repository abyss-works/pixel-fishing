-- Supabase가 아닌 Postgres에 마이그레이션 0001~0020을 적용하기 전에 실행한다.
-- 그 마이그레이션이 참조하는 Supabase 객체(API 역할 3개, auth.uid(), auth.users)를 같은 이름으로 만든다.
-- auth.users는 Supabase 덤프의 데이터를 그대로 받을 수 있게 같은 열(생성 열 confirmed_at 제외)을 둔다.
-- 덤프 데이터를 받는 이 표는 마이그레이션 0021이 읽어 Better Auth 표로 옮기므로 가져오기 순서에서 계속 필요하다.
-- 0021이 이름을 바꿔 남긴 이전 표는 0035가 지운다.
-- 역할 생성은 슈퍼유저 권한이 필요하다. 나머지는 앱 사용자로 실행해 앱 사용자가 소유하게 한다.

create schema if not exists auth;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud character varying,
  role character varying,
  email character varying,
  encrypted_password character varying,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token character varying,
  confirmation_sent_at timestamptz,
  recovery_token character varying,
  recovery_sent_at timestamptz,
  email_change_token_new character varying,
  email_change character varying,
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text,
  phone_confirmed_at timestamptz,
  phone_change text,
  phone_change_token character varying,
  phone_change_sent_at timestamptz,
  email_change_token_current character varying,
  email_change_confirm_status smallint,
  banned_until timestamptz,
  reauthentication_token character varying,
  reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);

-- Supabase의 정의와 같다. 요청 클레임이 없으면 null이라 이 DB에서는 RLS 본인 읽기 정책이 아무 행도 열지 않는다.
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
