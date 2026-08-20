-- 세이브 쓰기를 /api/save(service role) 경유로만 허용 — 클라이언트 직접 쓰기 회수
-- 읽기는 본인 행만 (RLS). service role은 RLS를 우회하므로 API가 유일한 쓰기 경로가 된다.
-- ⚠️ 프로덕션 프로젝트에만 적용. 개발용 프로젝트는 미적용(로컬 vite dev는 직접 쓰기 폴백 사용).

drop policy if exists "own save" on public.saves;

create policy "own save read"
  on public.saves
  for select
  using (auth.uid() = user_id);
