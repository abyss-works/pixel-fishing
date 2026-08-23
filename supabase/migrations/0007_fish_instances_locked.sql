-- fish_instances.locked 보강 — **0006을 손으로 고쳤던 것을 정규 경로로 되돌린다.**
--
-- 사고 경위: 개체 잠금(dev.6)을 넣으면서 `locked` 컬럼을 이미 존재하던
-- 0006_normalize.sql에 **직접 추가**했다. "아직 어느 DB에도 안 올라갔다"는 가정이었는데
-- 틀렸다 — 0006을 먼저 적용해 둔 환경에는 파일 수정이 닿지 않는다.
-- 결과: 그 환경에서 fish_instances INSERT가 전부 실패했고, 실패가 조용해서
-- "가방이 마지막 잡은 물고기 하나로 덮어써지는" 증상으로만 드러났다.
--
-- 교훈: **이미 적용됐을 수 있는 마이그레이션은 고치지 않는다. 새 파일을 추가한다.**
-- (0006_records → 0006_normalize 교체가 안전했던 건 그때는 정말 미적용이었기 때문이다.)
--
-- 아래는 멱등이다 — 0006 최신본으로 만든 새 DB에서는 아무 일도 하지 않는다.
alter table public.fish_instances
  add column if not exists locked boolean not null default false;
