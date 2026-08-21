-- DOWN: 0002 되돌리기 — 클라이언트 직접 읽기/쓰기 정책 복원 (0001 원본과 동일 문장)
-- 실행 전제: /api/save 경유 쓰기를 포기하고 클라이언트 직접 쓰기(v0.1.x)로 돌아갈 때만.

drop policy if exists "own save read" on public.saves;

create policy "own save"
  on public.saves
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
