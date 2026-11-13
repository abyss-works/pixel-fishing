-- 이전 인증 서버에서 옮겨 온 뒤 쓰지 않는 계정 표 auth.supabase_users를 지운다.
-- 0021이 공개 표의 외래 키와 관리자 사용자 명부 뷰를 현재 인증 표(auth.users)로 옮겼으므로 이 표를 참조하는 객체는 없다.
-- cascade를 쓰지 않는다. 뜻하지 않은 참조가 남아 있으면 객체를 조용히 지우지 않고 실패한다.
-- 지운 데이터는 되돌릴 수 없다. 운영 DB에 적용하기 전에 백업을 확보한다.
drop table if exists auth.supabase_users;
