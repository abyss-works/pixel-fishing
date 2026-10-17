// 실제 Postgres 테스트의 고정값.

// 운영·스테이징 프로젝트와 같은 Supabase Postgres 이미지 버전으로 고정한다.
// 일반 postgres 이미지에는 Supabase 역할(anon·authenticated·service_role)과 auth 스키마가 없어 RLS·권한 동작이 달라진다.
export const DB_TEST_IMAGE = 'supabase/postgres:17.6.1.155';

// 마이그레이션을 적용한 원본 데이터베이스. 테스트 데이터베이스는 이 원본을 복제한다.
export const TEMPLATE_DATABASE = 'app_template';

// 호스팅 환경의 데이터베이스 기본값과 맞춘다.
export const STATEMENT_TIMEOUT = '2min';
