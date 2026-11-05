-- 0027 되돌리기 — 길드 채팅 열과 길드 테이블 삭제. 가산 마이그레이션이라 down은
-- 스키마를 정말 되돌려야 할 때만 쓴다. 길드 채팅 메시지를 먼저 지운다(열이 사라지면 월드 채팅으로 보인다).
delete from public.chat_messages where guild_id is not null;
alter table public.chat_messages drop column if exists guild_id;
drop table if exists public.guild_invites;
drop table if exists public.guild_members;
drop table if exists public.guilds;
