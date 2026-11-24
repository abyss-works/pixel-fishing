# 변경 기록

이 파일은 생성된다. 직접 고치지 않는다. 형식은 Keep a Changelog를 따른다.

## [0.20.0] - 2026-11-24

### 기능

- 수령형 업적 80종(15개 해역 진행 업적 30종, 치장 업적 50종)과 즉시 적용 누적 보너스 업적 26종(23계열)을 두었다. 진행 업적의 보상은 골드(총 25,862,870G)이고, 치장 업적의 보상은 모자다. 업적 창은 오른쪽 위 메뉴의 업적 항목으로 열고, 탭 셋(진행, 누적 보너스, 치장)과 요약 줄(받은 업적, 받을 골드, 받을 모자, 모두 받기)로 구성했다.
  판정 근거는 도감, 유물, 외형과 모자, 네임드 토벌 기록, 업적 카운터다. 조건은 위 근거만 읽는 게임 규칙의 순수 함수(achievementProgress, evaluateAchievements)이며 서버와 화면이 같은 함수를 쓴다. events 표는 유실을 허용하는 후속 쓰기라 실시간 판정에서 읽지 않는다. 도감으로 셀 수 있는 값은 별도 카운터 없이 도감을 읽는다.
  조건을 처음 채운 업적은 claimable로, 수령한 업적은 claimed로 세이브의 achievements 맵에 저장한다. 모르는 업적 id와 상태도 보존해, 구 코드가 연 세이브가 돌아와도 같은 업적을 두 번 지급하지 않는다. 이미 조건을 채운 계정은 도입 뒤 첫 액션 확정에서 판정되어 claimable이 된다.
  아직 만나지 않은 어종 이름과 네임드, 밤 어종의 실명, 등급별 미발견 명단은 보이지 않고 진척은 숫자로만 보인다.
  - 업적: 이전 없음, 이후 수령형 80종(진행 30종 골드, 치장 50종 모자) + 즉시 적용 누적 보너스 26종(23계열)
  - 세이브에 저장하는 업적 상태: 이전 없음, 이후 achievements 맵(claimable, claimed). 세이브 버전은 올리지 않고 기본값 {}로 이관
  - 커밋: ce412cf2, 2d1eb62a, de7aa671, 4dee057b
- 치장 업적 50종의 보상으로 업적 모자 50종을 더했다. 보상으로만 얻고 골드로 살 수 없다. 얻은 모자는 옷장 모자 목록에 나오고, 아직 받지 못한 모자를 고르면 상세 칸에 받는 조건과 진척(미토벌 네임드는 출현 위치로 가림)을 보이며 사기 버튼을 두지 않는다. 잠금 표시는 옷장의 기존 규칙을 따른다.
  - 모자: 이전 5종(골드 구매), 이후 55종(기존 5종 + 업적 모자 50종, 업적 보상으로만 획득)
  - 옷장 모자 목록: 이전 업적 모자 없음, 이후 얻은 업적 모자 표시, 잠긴 모자의 상세 칸에 조건과 진척 표시(미토벌 네임드 실명 가림)
  - 커밋: ce412cf2, 9ae21290
- 누적 보너스 업적 26종(23계열: 전역 8계열 + 구역 7×2=14계열 + 최고 레벨 유물 1/3/6/8개 4단계)을 도입했다. 단계 문턱에 닿는 즉시 별도 수령 절차 없이 입질 대기 단축, 희귀·영웅·전설·돌연변이·네임드·구역 가중치, 판매가 보너스(sellBonus), 보유 유물 효과 배율(artifactBoost)이 단일 효과 묶음(PlayerContext)으로 합산(1 ± 합) 적용되며 스탯 창 보너스 탭과 스탯 상세 툴팁에 '업적 누적' 출처로 표시된다. 서버의 빠른 캐치 경로와 요청 간격 검사(catchTooSoon)도 동일 보너스를 반영한다.
  - 누적 보너스 업적: 이전 고정 골드 수령형 횟수·손맛 업적, 이후 26종(23계열) 즉시 자동 적용 누적 보너스(전역 8계열, 구역 14계열, 최고 레벨 유물 1/3/6/8개 4단계, 판매가 보너스 sellBonus 포함)
  - 수동 집계 카운터 키: 이전 고정 5종 + 수동 총계·전설·돌연변이, 이후 manual.total.<구역> 추가 및 빠른 캐치·간격 검사 연동
  - 커밋: 9647a18, 7e719420, 4ab9ad6e
- 세이브 상태(GameState)에 autoLockOnCatch(기본 false)와 autoLockedIds(어종·폼별 직전 자동 잠금 개체 uid 맵)를 두고 setAutoLockOnCatch 액션(무이벤트, 게스트 허용)으로 켜고 끌 수 있게 했다. 포획 시 가방 초과(방생·자동 기운 얻기) 판정 전에 자동 잠금을 먼저 적용해 새 개체는 초과 대상에서 보호하고 방금 해제된 기존 자동 잠금 개체는 초과 후보에 포함하며, 직접 잠근 개체는 해제하지 않고 개별 잠금 변경·가방 이탈 시 추적 맵을 정리한다. 빠른 캐치 경로의 catchLookup 단일 SQL에 잠긴 개체 최대 크기(real 단정밀도 통일)와 직전 자동 잠금 개체 조회 서브쿼리를 합쳐 추가 DB 왕복 없이 처리하고, 설정 창(SettingsModal) 가방 섹션에 낚을 때 자동 잠금 토글·라벨 툴팁·중복 요청 방지 가드를 추가했다.
  - 토글식 자동 잠금: 이전 가방 탭 1회성 일괄 자동 잠금만 지원, 이후 설정 창 가방 섹션에 낚을 때 자동 잠금 토글 추가(수동 잠금 보호, 추가 DB 왕복 0회)
  - 커밋: e7497ff9, c1b297c3, 346d2705, 201317ec
- 새 최상위 구역 northatlantic(북대서양, 열린 바다 문자 p 통행 전용)과 특수 해역 azores(아조레스 해령, 요구 파워 285/Lv56), bermuda(버뮤다 삼각지대, 요구 파워 315/Lv62)를 추가했다. 진입 배 게이트는 기존 9단계 가공 플랜트선(entryBoat 9)으로 두 해역을 모두 열며, 어종 17종(아조레스 해령 낮 7·밤 2, 버뮤다 삼각지대 낮 6·밤 2, 각 변이 1종)과 특수 어군 배치를 함께 추가했다.
  - 북대서양 구역과 해역: 이전 미개방(N), 이후 northatlantic(통행 전용), azores(파워 285/Lv56), bermuda(파워 315/Lv62), 진입 배 9단계 가공 플랜트선
  - 전체 어종 수: 이전 103종(낮 79, 밤 24), 이후 120종(낮 92, 밤 28), 북대서양 17종(아조레스 9, 버뮤다 8) 추가
  - 커밋: f24417ea
- 거점 lisbon(리스본항, anchors.lisbon lon -9.25, lat 39.0, facing west)을 추가하고 항구 공통 시설(게시판, 수배판, 공방, 조선소, 어시장, 마을행 여객선, 빠른 이동 여객선, 승선)을 배치했다. 북대서양 현상금 보상은 쉬움 15,000,000G, 보통 25,000,000G, 어려움 55,000,000G, 네임드 100,000,000G다.
  - 거점 항구 수: 이전 5곳, 이후 6곳(리스본항 lisbon 추가, 북대서양 바운티 수주 창구)
  - 북대서양 현상금 보상: 이전 없음, 이후 쉬움 15,000,000G / 보통 25,000,000G / 어려움 55,000,000G / 네임드 100,000,000G
  - 커밋: f24417ea
- 네임드 글로스터 바다뱀(gloucester-serpent, 아조레스 해령 한정, 체력 10, 형태 eel)과 구아반세스(guabancex, 버뮤다 삼각지대 한정, 체력 10, 형태 flowing)를 추가하고 도감 로어, 수배서, 흔적, 전승 4문단 및 수배 의뢰를 등록했다.
  - 네임드 수: 이전 6마리, 이후 8마리(글로스터 바다뱀 체력 10, 구아반세스 체력 10 추가)
  - 커밋: f24417ea
- 아조레스 해령 네임드 토벌 보상 영웅 유물 글로스터의 등마디(교환 재료: 소금 절인 등마디, Lv1\~5 강화 가능)를 추가했다. 보유 시 일반 등급 가중치 감소 효과가 적용된다.
  - 아조레스 해령 유물(글로스터의 등마디): 이전 없음, 이후 영웅 유물, Lv1\~5, 일반 등급 가중치 감소 효과
  - 커밋: f24417ea
- 버뮤다 삼각지대 네임드(구아반세스) 유물 사르가소의 그물망(sargasso-net)을 희귀(가방 용량 +10%)에서 전설 등급으로 개편해 동시 2칸 미끼 슬롯 조합과 미끼 지속 시간 50% 단축 페널티를 구현했다.
  - 전설 유물 및 시스템 효과(src/game/content/artifacts.ts, artifactLevel.test.ts): ArtifactSystemEffects를 선택 필드로 정리하고 extraBaitSlots·baitDurationCut을 추가해 sargasso-net을 grade: 'legendary', system: { extraBaitSlots: 1, baitDurationCut: 0.5 }와 숫자·금지 부호([·—–]) 없는 전설 로어로 갱신했다(ArtifactEffects.bagCap 선택 필드 유지).
  - 다중 미끼 저장·정규화·액션(logic.ts, cooking.ts, actions.ts, actionSchema.ts, achievements.ts): GameState.slots에 선택 필드 bait2(JSONB 무이관, safeSlots 위생 처리 및 비활성 시 생략)를 추가하고, maxBaitSlots·baitDurationScale·slotDurationMs·isActiveSlot을 도입했다. appliedSlots는 수동 캐치 활성 미끼의 중복을 제거한 뒤 항상 bait부터 채워 정규화하므로(v_catch_quality 호환), 1개만 활성일 때는 bait 키만 남고 2개 모두 활성일 때는 효과를 합산한다. eat 액션은 replaceSlot('bait' | 'bait2')을 지원하며, 동일 미끼 재사용 시 복사 대신 기존 슬롯 종료 시각만 갱신하고, 빈 슬롯이 있으면 확인 없이 배정하며, 두 슬롯이 모두 찬 상태에서 세 번째 미끼를 쓸 때는 교체 대상을 선택한다(생략 시 만료 임박 슬롯 교체). counterIncrementsForEvents의 catch.bait 집계도 bait2를 함께 확인한다.
  - UI·알림·스탯·관리자(bagItems.ts, ItemSection.tsx, BagTab.tsx, SlotChips.tsx, useSlotExpiryAlerts.ts, stats.ts, contentCatalog.ts, UserDetail.tsx): 5분 -> 2분 30초 지속 시간 표기, 가방 미끼 행 '사용 중' 배지, 3번째 미끼 교체 대상 선택 확인 창, BagTab의 artifactSystemLines 보너스/페널티 표시, SlotChips의 고유 slotKey 키 분리, useSlotExpiryAlerts의 다중 미끼 슬롯 추적, 스탯 창·관리자 카탈로그·유저 상세의 bait2 및 시스템 효과 표시를 반영했다.
  - 사르가소의 그물망(sargasso-net) 등급·효과: 이전 희귀 등급(Lv1\~5), 가방 용량 +10%(Lv1 기준), 이후 전설 등급(고정 효과), extraBaitSlots: 1(동시 2칸) · baitDurationCut: 0.5(5분 -> 2분 30초)
  - 미끼 슬롯·액션·집계(slots, cooking.ts, actions.ts, achievements.ts): 이전 단일 bait 슬롯, 5분 고정 지속, 이후 선택적 bait2 추가, appliedSlots bait 우선 정규화, 동일 미끼 갱신·빈 슬롯 자동 채움·replaceSlot 교체·효과 합산·catch.bait2 집계
  - 가방·HUD·알림·관리자 UI: 이전 단일 미끼 칩·만료 추적, BagTab 전설 시스템 효과 미표시, 이후 2분 30초 표기, 사용 중 배지, 교체 슬롯 선택 창, SlotChips slotKey 분리, 다중 만료 알림, BagTab·관리자 지원
  - 커밋: 1f5bf2b4, ece1bee8
- 버뮤다 삼각지대 네임드 토벌 보상 희귀 유물 사르가소의 그물망(교환 재료: 젖은 모자반 밧줄, Lv1\~5 강화 가능)을 추가했다. 보유 시 가방 용량 증가 효과가 적용되며 PlayerContext 효과 묶음의 bagCapacityOf를 통해 반영된다(이후 전설 등급 다중 미끼 유물로 개편됨).
  - 버뮤다 삼각지대 유물(사르가소의 그물망): 이전 없음, 이후 희귀 유물, Lv1\~5, 가방 용량 증가 효과
  - 커밋: f24417ea
- 길드 최대 레벨을 Lv.10(GUILD_MAX_LEVEL = 10)으로 확장하고, 일일 기여 상한 상향과 이중 계층 스킬 자유 강화 시스템을 구현했다.
  - 성장 및 일일 기여 상한(src/game/rules/guild.ts): 누적 기여도 기준을 [0, 10k, 25k, 50k, 100k, 200k, 350k, 550k, 800k, 1,100k](Lv.6~10 구간 간격 +100k/+150k/+200k/+250k/+300k)로 확장하고, 일일 기여 상한을 명성 2,500(GUILD_DAILY_FAME_CAP), 일반 의뢰 1,000, 네임드 토벌 1,000으로 상향했다.
  - 이중 계층 스킬 및 자유 강화(src/game/rules/guild.ts, api/_data/guilds.ts, api/guilds.ts, api/action.ts, api/_data/load.ts, api/_data/save.ts): Lv.6부터 레벨당 무료 자유 강화 포인트 1개(최대 5개)를 지급하며, 활성 길드원(leader·member) 누구나 열린 스킬에 골드 기부 기본 단계(baseRank 1\~5)와 별개로 자유 강화(enhanceRank 0\~5)를 투자해 합산 최대 10단계까지 독립 합산할 수 있다. 또한 활성 길드원 누구나 개인 골드 20,000,000G(GUILD_ENHANCE_RESET_COST)를 내고 횟수·재사용 대기 제한 없이 모든 enhanceRank를 0으로 초기화할 수 있으며 기본 단계와 모인 골드(pool)는 유지한다. POST /api/guilds/:id/bonuses/:bonus/enhancements와 POST /api/guilds/:id/enhancements/reset, goldDebit 잔액 검증(gold >= 금액)을 추가하고 0038_guild_skill_enhance 마이그레이션(enhance_rank 열 및 guild_logs kind 제약)을 반영했다.
  - 화면 및 항해일지(GuildSkillsTab.tsx, GuildModal.tsx, GuildLogbookTab.tsx, BonusTab.tsx, features/guild/model/guild.ts, features/gameplay/model/stats.ts): 남은 포인트 슬롯과 초기화 확인 창, 기존 5개 금색 칸 바깥에 1..enhanceRank 보라색 테두리를 감싸는 이중 표시 및 모바일 2행 배치, 항해일지 'enhance'·'enhance-reset' 자연어 문장, 스탯 창 보너스 탭 기본·자유 강화·합계 툴팁을 연결했다.
  - 길드 최대 레벨 및 일일 기여 상한: 이전 최대 Lv.5(누적 100,000), 일일 명성 2,000·일반 의뢰 500·네임드 1,000, 이후 최대 Lv.10(누적 1,100,000), 일일 명성 2,500·일반 의뢰 1,000·네임드 1,000
  - 길드 스킬 강화 계층 및 초기화: 이전 골드 기부 기본 단계 1\~5단계만 지원, 이후 기본 1\~5 + Lv.6\~10 포인트 자유 강화 0\~5(합산 최대 10단계), 활성 길드원 누구나 20,000,000G 무제한 초기화
  - DB 스키마·REST API·길드 스킬 UI: 이전 guild_bonuses.rank 단일 단계, enhance API·항해일지 없음, 이후 0038_guild_skill_enhance 마이그레이션, enhance·reset API, 금색+보라 테두리·모바일 2행·보너스 툴팁
  - 커밋: 0a4d9eca, d32a7833, 1c7dcd37
- 구현 영역(WORLD_BOUNDS, -82..157E, -36..44N) 내부의 미개방 바다('N') 5개 블록을 모두 제거하고 남대서양 열린 바다(a)의 서단을 -15에서 -82로 확장해 직사각형 바다 전체를 개방했다.
  - 지도 설정 및 마스크(tools/configs/world.json, world.mask.ts, earth.mask.ts): 지중해(-5.5..36E, 30..44N), 카리브해(-82..-60W, 9..30N), 남미 서부 동태평양(-82..-70W, -36..9N), 남미 동부 미개방 바다(-68..-15W, -36..0N)의 'N' 항목 5개를 제거하고 남대서양 열린 바다(a)를 lonMin -82까지 확장한 뒤 world.mask.ts와 earth.mask.ts를 재생성했다('N' 셀 0개).
  - 범례 및 검증(world.ts, world.test.ts, fieldEngine.test.ts): 향후 해역 확장을 위해 WORLD_LEGEND의 'N'(closed: true) 정의와 엔진 통행 불가 판정 구조는 예약으로 유지하되 구현 영역 개방 검증 및 closed 엔진 단위 테스트를 현행 상태에 맞게 갱신했다.
  - 구현 영역(WORLD_BOUNDS) 미개방 바다(openZones): 이전 지중해·카리브해·남미 서부·남미 동부 N 블록 5개(남대서양 a 서단 -15), 이후 N 블록 5개 제거 및 남대서양 a 서단 -82 확장(직사각형 전면 개방, 세계지도 미개방 음영 제거, WORLD_LEGEND N 정의 예약 유지)
  - 커밋: 8c4dba7c, ebd58a79
- 관리자 대시보드(/admin/)를 8개 탭으로 확장하고 노후 지표·안내와 운영 안전장치를 정비했다.
  - 콘텐츠 탭(#/admin/content): 어종 120종(밤 전용 28종·돌연변이·크기 분포·v1/v2 그림체 전환·유영 토글), 네임드 8종(초상화·수배서·흔적·전승 4문단), 유물 8종(Lv1\~5), 업적 71종과 누적 보너스 23계열(25종), 모자 46종과 의상 프리셋 6종·팔레트 12색(PersonSprite 착용 미리보기), 요리 10종과 기운 4종, 배 9척, 구역·해역 계층 17개, 현상금 의뢰 74종 전체를 world.mask 유입 없이 로컬·오프라인 포함 열람·검수할 수 있다.
  - 지표·원장·상세 정비: regions.ts에 남대서양·북대서양 반영 및 위치 한글화(formatAdminLocation), balanceLive 도감(0..120)과 낚싯대(1..66+) 버킷 확장, 경제 원장 deliverBounty·claimAchievement·claimAllAchievements·buyHat 반영 및 폐지 buyBait 제거, BalanceTab/FishTab 기본 접힘·구역/등급/검색 필터 및 밤 어종 확률 표시, 상단 공통 새로고침 버튼과 마지막 조회 시각 추가, userState 드릴다운(도감·네임드·유물·모자·업적·기운/요리·가방/전시) 추가, 사실 불일치 문구와 사문화 ?q= 엔드포인트 3종(dailyActive, catchQuality, retention) 정리.
  - 일괄 우편 안전장치: 클라이언트·서버 중복 수신자 차단, 1회 최대 지급 골드 상한(500,000,000G) 미리보기·거부, UUID 멱등 키 10분 TTL 캐시(in-flight 동시성 및 본문 불일치 충돌 차단)와 최근 10분 중복 우편 창 검사(409 duplicate-mail), 존재하는 수신자 0명 발송 차단을 적용했다.
  - 관리자 대시보드 콘텐츠 검수 및 탭 구성: 이전 7탭(밸런스 탭 해역 EV 일부만 열람), 이후 8탭(콘텐츠 탭 신설, 9개 콘텐츠 축 오프라인/로컬 전체 열람·v1/v2·유영·전승 4문단)
  - 대시보드 지표·위치·유저 상세·새로고침: 이전 남/북대서양 누락, 도감 90·낚싯대 Lv31 버킷, buyBait 잔존, 원시 위치 키, 상세 게임 상태 부재, 이후 전 구역 및 한글 위치, 도감 120·Lv66+ 버킷, 현행 경제 원장, userState 상세, 공통 새로고침 및 등급 필터
  - 일괄 우편 안전장치: 이전 중복 수신·재전송 멱등·총 지급 골드 상한 검사 없음, 이후 중복 수신 차단, 총액 상한(500,000,000G) 미리보기·거부, 10분 멱등 캐시 및 중복 발송 창 차단
  - 커밋: 3b8c329f, 82ecdc5f, 2b30f31a, 4c7d4f61, 6293ee99, d1f48f1e, 5c617feb
- F9 개발 도구를 6개 묶음(빠른 프리셋·이동/시간·도감/네임드·장비/아이템/업적·수배·계정/스냅샷)으로 전면 개편하고, 프리뷰·로컬 요청 단위 밤/낮 강제 전환(forcePhase)과 정규화 표 삭제·동기화·스냅샷 복원 경로를 구현했다.
  - 서버·DB 소유권 확장(신규 SQL 마이그레이션 없음): _data/save.ts에 records 삭제 조각(recordsRemoved)을 추가해 dex.reset·named.reset·import·snapshot.restore의 도감 잔존을 해소하고, _data/bounty.ts의 bounty_clears 네임드 조각 및 _data/achievements.ts의 achievement_counters 절대값·초기화·복원 조각을 api/action.ts 단일 트랜잭션과 StatePatch.scalars에 동기화했다.
  - debug 명령 20종 및 보안 불변식: dex.fill(마을 포함, 일반/돌연변이, 대어 크기), dex.reset, named.unlock/reset, items.grant, cooking.finish, artifact.set, hat.set, achievement.setCounter/resetCounters/evaluate, bag.spawn, snapshot.restore(배열 10,000 상한·UUID/중복·스칼라 범위 검증 및 경량 감사 로그), bounty.expireTickets 단일화. 모든 명령과 forcePhase는 api/devAccess.ts(DEPLOY_ENV + admins 명부)로 운영 환경에서 절대 차단된다.
  - 프리뷰 밤/낮 전환 및 순간이동·스냅샷 UI: forcePhase를 수동·방치 캐치와 useGameTime 화면 연출에 동시 연동하고, 거점 7곳·해역 15곳 순간이동, 네임드 8종 직전 항구 자동 이동 포함 프리셋, 검색·구역 필터, localStorage 기반 5슬롯 스냅샷 백업/복원을 구현했다.
  - F9 개발 도구 기능 및 서버 동기화: 이전 5탭·7종 명령(수배·기본 스탯·일반 도감만), records 삭제 및 카운터/네임드 토벌 동기화 부재, 오프라인 시간 전용, 이후 6묶음·20종 명령(검색/구역 필터, 거점 7·해역 15 순간이동, 프리뷰 forcePhase, 도감/네임드/요리/유물/모자/업적/가방/스냅샷 원자적 복원)
  - 커밋: f3be7bac, f1bbddb6, 12688a86, 9c734c39
- 관리자 API 요청 제한 완화와 캐시 공유, 운영 화면 조치 연결 및 데이터 정합성을 정비했다.
  - 서버 API(api/admin.ts, api/_data/admin.ts, api/_data/account.ts, api/_data/telemetry.ts): GET ?q=overview 통합 조회를 추가해 명부·최근 이벤트·스팸 플래그·일별 집계·리텐션·최근 세션·실시간 접속을 한 번에 반환하고, userState를 확장해 보유 모자 목록·착용 모자·최근 가방 개체 30마리·방문 지역·쿠폰·진행 중 수배·도전권·활성 세션 수를 포함한다. POST ?q=revokeSessions를 추가해 auth.sessions 행을 모두 삭제하고 adminRevokeSessions 감사 이벤트를 남긴다.
  - 클라이언트 캐시·오류 처리(httpApi.ts, QueryProvider.tsx, queryKeys.ts, useAdminQuery.ts, useAdminStats.ts, useAdminUserActions.ts): HttpAdmin GET 429 시 Retry-After 또는 짧은 백오프로 최대 2회 재시도하고 429·비-JSON 응답을 명확한 오류로 변환한다. useAdminOverview 성공 시 adminKeys.users·spamFlags 등 공유 정규 키를 채워 30초 staleTime과 1.5초 수동 새로고침 쿨다운으로 중복 풀스캔을 막았다.
  - 운영 화면 정합화(EconomyTab, BountyFunnelSection, AnalysisTab, ProgressionTab, ChatReportsSection, UserDetail, OpsTab): 경제·바운티 퍼널을 events 7일 보관 한도로 고정(30·90일 기간 전환은 daily_stats 기반 활동 구역에만 유지)하고, 진행 탭은 현행 오픈월드 지역(village, world)과 7개 존·수배 해금 기준으로 맞추었다. 채팅 신고 목록에서 대상 유저 상세 열기와 원클릭 제재/해제를 연결하고, 유저 상세에 확장 게임 상태와 세션 강제 종료 조치를 추가했다.
  - 개요 조회 및 탭 간 캐시 공유: 이전 개요 탭 다중 개별 조회, 탭 전환 시 users·spamFlags 중복 조회, 이후 GET ?q=overview 통합 조회 + RQ 단일 정규 키 공유(30초 staleTime, 1.5초 새로고침 쿨다운)
  - 429 백오프 및 오류 처리(HttpAdmin): 이전 429 재시도 없음, 비-JSON 응답 파싱 실패 노출, 이후 GET 429 Retry-After 백오프 최대 2회 재시도, 429·비-JSON 표준 오류 변환
  - 유저 상세·채팅 신고 조치 및 세션 강제 종료: 이전 채팅 신고 조치 연결 부재, 세션 강제 종료 없음, 모자·가방 상세 미표시, 이후 신고 행 상세 보기·원클릭 제재/해제, POST ?q=revokeSessions + adminRevokeSessions 감사 이벤트, userState 확장
  - 경제·진행 탭 기준 정합화: 이전 경제·바운티 퍼널에 30·90일 전환 혼재, 진행 탭 구 지역명 혼합, 이후 events 7일 한도 고정(장기 추이는 daily_stats), 현행 오픈월드(village, world) 및 7개 존 기준
  - 커밋: 4640baca, b93858c0, 8ee9f55a, d6daf812

### UI

- 새로 claimable이 된 업적이 생길 때마다 메뉴 줄의 업적 항목에 표시를 붙이고, 메뉴가 접혀 있으면 메뉴 버튼에도 새 알림 표시를 붙인다. 같은 시점에 메시지 창에 한 줄을 남긴다("“{이름}” 업적을 받을 수 있어요.").
  화면은 액션 확정 전후 게임 상태를 비교하는 순수 함수(newlyClaimable)로 새로 받을 수 있게 된 업적을 가려낸다. 첫 상태 적재(클라우드 저장, 게스트 저장, 계정 연결)에서는 비교만 하고 알리지 않는다. 오래된 세이브를 열 때 지나간 알림이 한꺼번에 뜨지 않게 하기 위해서다.
  - 받을 수 있게 된 업적의 알림: 이전 없음, 이후 메뉴 줄 업적 항목과 접힌 메뉴 버튼의 표시, 메시지 창 한 줄
  - 커밋: 053b6576, 2d1eb62a, de7aa671
- 낱개 받기와 모두 받기가 같은 방식으로 결과를 알린다. 토스트와 메시지 창에 받은 것을 적고, 모두 받기는 받은 골드 합계와 모자 이름을 함께 적는다. 모두 받기의 결과는 액션 결과에 골드와 모자 목록을 실어 보내 화면이 그 값을 그대로 표시한다. 낱개 받기의 메시지는 “{이름}” 업적 보상으로 {보상} 받았어요. 꼴이다.
  - 커밋: 3d427529, fa8cc06b, 69815cdb, 0519844f
- 업적 창 탭 본문을 한 줄 목록에서 카드 격자로 바꿨다. 카드에는 이름표, 조건 문구, 진척 게이지와 현재/목표 숫자, 보상 칸, 상태와 [받기] 줄을 위에서 아래로 둔다. 받을 수 있는 카드는 테두리를 강조하고 [받기]만 두며, 진행 중과 받음은 상태 글자만 두고 버튼 자리를 비운다. 받은 카드는 흐리게 하되 보상 칸은 그대로 보인다.
  보상 칸은 위 정보와 1px 선으로 나눈다. 골드 보상은 동전 아이콘과 금액, 모자 보상은 모자를 쓴 머리 그림과 모자 이름을 둔다. 머리 그림은 사람 그림의 머리와 모자 그리기를 그대로 쓰고, 사람 그림 전체의 픽셀은 바뀌지 않는다.
  열 수는 창 본문 폭으로 정한다. 카드 최소 폭을 둘 넣지 못하면 1열로 내려가고 가로 스크롤을 만들지 않는다. 요약 줄, 탭 셋(진행, 누적 보너스, 치장), 구역 묶음·필터·정렬, 수령 액션을 구성했다. 카드 본문은 포커스를 받지 않고 [받기]만 받으며, [받기]의 접근성 이름에 업적 이름을 붙이고 진척 막대의 이름도 업적마다 다르게 두었다.
  - 업적 창 탭 본문: 이전 한 줄 목록, 이후 카드 격자(카드 최소 폭 기준 열 수, 모자라면 1열)
  - 업적 항목의 진척 표시: 이전 텍스트의 현재 / 목표, 이후 현재/목표 숫자와 가로 게이지
  - 업적 항목의 보상 표시: 이전 보상 이름 텍스트, 이후 골드는 동전 아이콘과 금액, 모자는 모자를 쓴 머리 그림과 이름
  - 커밋: d982faa3, 1f133eb8, 0397d306, 204bbd38
- 태평양 구역의 첫 해역(sea)과 인도양 구역의 첫 해역(indian) 표시 이름이 상위 구역 이름과 겹치지 않도록 각각 태평양 연안과 인도양 연안으로 바꿨다. 해역 식별자와 상위 구역 이름은 유지하고, 화면 표시명과 테스트를 함께 맞췄다.
  - 태평양 첫 해역(sea) 표시 이름: 이전 태평양, 이후 태평양 연안
  - 인도양 첫 해역(indian) 표시 이름: 이전 인도양, 이후 인도양 연안
  - 커밋: a6b42055
- 가방 탭 물고기 섹션 제목의 보유 수량과 상한에 천 단위 쉼표 포맷터(fmtNum)를 적용하고 회귀 테스트를 추가했다.
  - 가방 탭 물고기 수량·상한 표기: 이전 쉼표 없는 숫자 표시, 이후 fmtNum 천 단위 쉼표 표시
  - 커밋: be2ee60a
- 플레이어 상세 정보 창(PlayerModal, PlayersModal)을 PC 680px 2열 레이아웃으로 통일하고, 공개 프로필 API(api/_data/profile.ts, api/players.ts)가 접속 중 또는 마지막 위치, 수령 완료 업적(claimed 전용), 보유 모자와 유물·유물 레벨, 전 6구역 일반·돌연변이 도감 요약을 함께 반환하도록 확장했다. 비공개 필드(claimable 업적, 원시 카운터, 골드, 가방, 순위, 천장)는 제외한다.
  - 플레이어 상세 레이아웃: 이전 진입 경로에 따라 1열·2열 혼재, 이후 PlayerModal·PlayersModal 모두 PC 680px 2열 통일
  - 위치·업적·수집품·도감 표시: 이전 접속 중 위치만 부분 표시, 수집·업적 요약 간소화, 이후 접속·마지막 위치 상시 표시, 업적(claimed)과 수집품(모자·유물 레벨) 분리, 전 구역 일반·돌연변이 도감 나란히 비교
  - 커밋: 091571a1, 145b11f2
- 게임 UI 전반의 v3 시각·계층 기준을 일괄 정비하고 공용 프리미티브와 회귀 가드를 통합했다.
  - 디자인 토큰·공용 프리미티브(src/index.css, presentation/ui/): --radius-sm·--radius-md 제거 및 --c-line-dim·--inset-deep/base/light·--notch-sm·.pf-btn.sm/xs/accent/danger 토큰을 정립하고, 앱 모달(Modal)과 LoadingOverlay까지 노치+베벨(.pf-frame)로 통일했다. ProgressMeter(1줄/2단 stacked)·SegmentedStepBar·EmptyState를 공용화하고, PillButton은 관리자·개발 도구 전용으로 제한했으며, HelpHint(NOTCH_SM 정사각 노치)·RarityDot(네모 점)·Badge·NoteTag·ChoiceCard·ArrowButton·Gated의 둥근 모서리와 완료·잠금 카드의 opacity 흐림을 제거했다.
  - 절대 테두리·베벨 두께 3계층: 16px 이하 점·견본·Inset 내부 중첩 구역(Inset borderless)과 단면 구분선은 0px/1px 단면선(Tier 0), 26px 이하 소형 칩·12px 이하 슬림 게이지 트랙(HelpHint, ArrowButton, ProgressMeter, SegmentedStepBar, BagMeter, PowerMeter, HudChip, ToggleChip)은 베벨 없는 1px 평면 테두리(Tier 1), 28px 이상 표준 버튼·입력·카드·모달(Button, Frame, Inset, MovePad, 모바일 시트 등)은 1px 테두리+1px 미세 베벨(Tier 2)로 통일했다.
  - HUD·사이드바·모달·문구 정비(BaseMenu, BagTab, DexDetail, VRegion, VHelp, WardrobePanel, BountyPanel, GuildSkillsTab, StatsModal, RankingModal, PlayerInfo, FerryModal 등): BaseMenu 구역 틀을 오목 Inset으로 낮추고, 모바일 360px 1열/반응형 격자와 고정 정보 줄 줄바꿈(고아 구분선 제거)을 적용했으며, 게임 화면·기능 모델 문자열의 가운뎃점·줄표([·—–])와 원시 구현·네이티브 title 속성을 제거해 uiGuard.test.ts 가드로 고정했다.
  - 공용 UI 프리미티브 및 테두리·베벨 두께 기준: 이전 rounded-sm/md/full·opacity 흐림·Frame-in-Frame·2px/3px 중첩 테두리 혼재, ProgressMeter/SegmentedStepBar/EmptyState 미공용, 이후 직각 노치·Inset-in-Panel·3계층(Tier 0/1/2) 1px 기준 통일, 공용 미터·빈 상태 승격 및 PillButton 게임 화면 사용 차단
  - 모바일 반응형 및 화면 문구 금지 부호: 이전 다열 카드/고정 정보 줄 360px 깨짐·고아 구분선, 게임 문구 내 가운뎃점·줄표 잔존, 이후 360px 반응형 열 수·줄바꿈 정합화 및 게임 UI·기능 모델 [·—–]·원시 프리미티브·title 속성 0건 가드 고정
  - 커밋: c95c09ec, 86a66aa7, 2fef7ef7, 1b133ee5, 916632e5, 3fed9f16, 73617618, a33a7688
- 시스템 로그(MessageLog)를 완전한 정본으로 유지하면서 고신호 알림만 동시 미러링하는 단일 팬아웃 토스트 체계를 구현했다.
  - 순수 미러링 정책(features/display/model/toastPolicy.ts): 43종(및 하위 호환 legacy.untyped) 시스템 이벤트를 Tier A(전설·첫 돌연변이 포획, 네임드 흔적, 포획 거부, 달성 가능 업적, 귀환 정산, 토벌·의뢰 완료, 유물 교환, 배 구매, 첫 해역 방문, 길드·친구 실시간 알림, 미수령 우편, 치명 오류, 계정 이정표 16종 상시 동시 노출), Tier B(모달 열림·채팅 접힘·쿨다운 조건부 17종), Tier C(일상 포획·판매·외형 등 시스템 로그 전용 10종)로 분류하고 우선순위(P0\~P3), TTL(2.8\~6초), 2초 동일 서명 중복 억제, 카테고리 쿨다운, replaceKey 갱신, 150\~300ms 마이크로 배치 병합과 enqueueToast(PC 최대 3개·모바일 최대 2개)를 정의했다.
  - 단일 라우터·루트 오버레이·설정(useMessageLog.ts, FloatingToastLayer.tsx, GameView.tsx, src/index.css, toastEnabled.ts, SettingsModal.tsx): 모든 알림은 예외 없이 MessageLog에 먼저 기록한 뒤 정책 통과 시에만 스테이지 containment 바깥 루트 오버레이(--z-toast: 32)에 6종 톤(gold, accent, danger, guild, epic, neutral)과 360px 1줄 요약(원격 시설·이동 버튼 없이 닫기 버튼만 제공)으로 띄운다. 설정 창 알림 섹션에 기기별 로컬 설정(pf-toast-enabled, 기본 켜짐) 토글을 추가했으며 꺼진 상태에서도 모달 내 직접 조작 거부(system.modalRejected)는 예외적으로 유지한다.
  - 시스템 알림 토스트 미러링 및 배치 계층: 이전 창 열림 시 단순 setToast만 스테이지 내부(--z-toast: 25)에 노출, 이벤트 분류·중복 억제·설정 없음, 이후 toastPolicy 단일 팬아웃(Tier A/B/C), 루트 오버레이(--z-toast: 32)·6종 톤·1줄 규격·PC 3/모바일 2 상한·pf-toast-enabled 설정 추가
  - 커밋: c4038c62, 6d191805, a0fc054f
- UI 캡처 점검에서 확인한 화면 배치 8건과 수배판 도감 미달 안내 표기 1건을 정리했다.
  - TabBar: 잠기지 않은 탭의 라벨과 수 배지를 inline-flex 묶음으로 감싸 줄바꿈되지 않게 맞췄다.
  - PriceTag: inline-flex 기준으로 바꿔 인라인 정렬이 어긋나지 않게 했다(현 시점 제품 코드 내 직접 호출처 없음).
  - FriendsModal: 요청 탭 루트의 중첩 스크롤을 없애고 받은·보낸 요청 표가 남은 높이를 나눠 채운 뒤 각 TableBox 안에서 스크롤하게 했다.
  - MailboxModal / RankingModal / SummaryTab / NoGuild / GuildSkillsTab: 우편함 받기 줄 높이를 버튼 높이에 맞게 키우고, 랭킹 내 순위 줄 왼쪽 여백(pl-2), 스탯 요약 첫 수치 칸 왼쪽 구분선 제거, 길드 찾기·만들기 버튼 동일 폭(w-16), 길드 스킬 트리 세로 중앙 배치를 맞췄다.
  - 수배판 도감 미달 조건 안내: 화면 문구 기준에 맞춰 가운뎃점을 빼고 괄호 표기로 통일했다.
  - 소셜 요청 탭 표 배치: 이전 고정 높이 표 둘과 바깥 스크롤 겹침, 이후 남은 높이를 나눠 각 표 안에서만 스크롤
  - 탭 수 배지·우편 받기 줄·랭킹 내 순위·스탯 요약·길드 버튼·스킬 트리 배치: 이전 세로 줄바꿈, 36px 받기 줄, 여백·구분선·버튼 폭 어긋남, 이후 한 줄 배지, 50px 받기 줄, 닉네임 열·첫 칸·동일 폭·세로 중앙 맞춤
  - 수배판 도감 미달 조건의 남은 어종 수 표기: 이전 가운뎃점 구분 표기, 이후 괄호 표기
  - 커밋: 8d1e1192, 69a24552
- 업적 창 UI 개편, 북대서양 치장 업적·모자 추가, 진행 보상·누적 보너스 분산 재조정 및 플로팅 알림 층을 구현했다.
  - 업적 창·카드 위계(AchievementsModal.tsx, AchievementCard.tsx, PersonSprite.tsx, notch.ts): Inset-in-Panel 위계와 NOTCH_SM 상태·단계 배지, claimed 카드의 깊은 오목 바탕(bg-bg)과 선명한 제목(text-text) 대비를 적용했다. 진행 탭은 구역 묶음과 미완료만 보기 토글 칩을, 누적 보너스 탭은 전역·구역·유물 3묶음과 스탯 창 보너스 탭 바로가기 버튼을, 치장 탭은 6종 노치 ToggleChip(모바일 2×3 균형 그리드) 필터를 제공한다. CumulativeBonusCard는 단일 분절 게이지를 쓰며, NamedGroupCard는 미토벌 시 물음표 실루엣(mystery)과 툴팁 '???'까지 스포일러를 가린다.
  - 플로팅 1줄 알림(FloatingToastLayer.tsx, useMessageLog.ts, GameView.tsx, src/index.css): 창이 열려 있을 때 스테이지 위(--z-toast: 25)에 최대 2개, 4.5초 자동 소멸 비차단 1줄 알림 배너(닫기 버튼만 제공, 옷장 열기·바로 착용 등 원격 이동 버튼 제외)를 띄운다.
  - 북대서양 치장·모자 및 이름·로어 정비(achievements.ts, wardrobe.ts, actors.ts): 북대서양 돌연변이·한밤·네임드(글로스터 바다뱀, 구아반세스) 업적·모자 9종을 더해 수령형 업적 80종(진행 30 + 치장 50)·모자 55종(골드 5 + 업적 50)으로 확장했고, 태평양 한밤 업적명 접두사 통일 및 인도양 밤 모자 2종(별빛 몬순 베레모, 밤안개 향신료 두건) 이름·로어를 정비했다.
  - 진행 보상·누적 보너스 분산(achievements.ts, actions.ts, effects.ts, catalog.ts, saleWindow.ts, stats.ts): 해역 진행 보상을 basic <= full 불변식과 함께 총 25,862,870G로 미세 조정하고, 누적 보너스를 전설 손맛(legendaryWeight +4%), PERFECT 챔질(rareWeight +4%), 미끼 손맛(epicWeight +3%), 누적 판매(sellBonus +3%, saleProceedsOf·saleProceeds 합산), 수동·방치(입질 대기 각 -5%), 최고 레벨 유물 4단계(1/3/6/8개, 최대 +15%)로 분산해 총 26종(23계열)으로 재구성했다.
  - 업적 창 위계·게이지·필터·스포일러 실루엣: 이전 Frame 카드, opacity-50 claimed, 3열 필터, 중복 막대, 모달 내 토스트 미분리, 이후 Inset-in-Panel(bg-bg+text-text 대비), NOTCH_SM 배지, 모바일 2×3 노치 ToggleChip, 단일 분절 게이지, mystery 실루엣, FloatingToastLayer(--z-toast: 25)
  - 치장 업적·모자 수 및 인도양·태평양 명칭: 이전 치장 41종(모자 46종), 한밤 도감 접두사 없음, 남극성/극야 명칭, 이후 북대서양 9종 추가 치장 50종(수령형 80종, 모자 55종), 태평양 한밤 접두사·인도양 밤 모자 개명
  - 진행 보상 총액 및 누적 보너스 분포: 이전 25,862,500G, 누적 25종(유물 3단계, 입질 대기·이동 속도 편중), 이후 25,862,870G(basic <= full), 누적 26종(유물 4단계 8개, 희귀·영웅·전설 가중치·판매가 보너스 분산)
  - 커밋: 9f43443c, 32760bac

### 밸런스

- 북대서양이 최신 지역 프리셋을 맡으면서 1-4 마다가스카르(모잠비크 해협·코모로 심해)를 안정화 프리셋(희귀 2000, 영웅 500, 전설 100)으로, 1-5 남대서양(남대서양 용승대·세인트헬레나)을 한 단계 이전 프리셋(희귀 2000, 영웅 400, 전설 55)으로 전환했다. 해역별 방치 EV가 현행 허용 폭(+-3.5% 이내)을 유지하고 등급 간 가격 비례가 무너지지 않도록 두 지역 어종 35종의 가격을 해역별 균등 배율로 재조정했다(예: 모잠비크 대왕 쥐가오리 70,000G -> 53,000G, 코모로 메가마우스 150,000G -> 110,000G·칠흑의 메가마우스 300,000G -> 220,000G, 용승대 키안다 400,000G -> 300,000G·칼룽가 800,000G -> 600,000G, 세인트헬레나 갈라파고스 상어 750,000G -> 560,000G·큰눈홍치 1,500,000G -> 1,100,000G 등).
  - 마다가스카르 등급 가중치: 이전 한 단계 이전 프리셋(희귀 2000, 영웅 400, 전설 55), 이후 안정화 프리셋(희귀 2000, 영웅 500, 전설 100)
  - 남대서양 등급 가중치: 이전 최신 지역 프리셋(희귀 2000, 영웅 300, 전설 15), 이후 한 단계 이전 프리셋(희귀 2000, 영웅 400, 전설 55)
  - 마다가스카르·남대서양 35종 가격: 이전 기존 1-4/1-5 가격(예: 메가마우스 150,000G, 키안다 400,000G, 큰눈홍치 1,500,000G), 이후 해역별 균등 배율 보정 가격(예: 메가마우스 110,000G, 키안다 300,000G, 큰눈홍치 1,100,000G)
  - 영향: 영향: 전 해역 기대 수익 사슬과 게이트 위반 0건 유지. 되돌리기: 등급 가중치 전환과 어종 가격을 이전 커밋 값으로 복원한다.
  - 커밋: f24417ea, d22799bf
- 1-5 남대서양 일반 의뢰의 골드 보상을 세인트헬레나 대표 방치 EV 기준으로 재산출해 상향했다(쉬움 3,000,000G 유지, 보통 5,500,000G -> 6,500,000G, 어려움 10,000,000G -> 15,000,000G). 네임드 토벌 보상(아다마스토르, 야스코니우스)은 v0.19.3과 같은 25,000,000G를 유지했다.
  - 1-5 남대서양 보통 의뢰 골드 보상(bounties.ts): 이전 5,500,000G, 이후 6,500,000G
  - 1-5 남대서양 어려움 의뢰 골드 보상(bounties.ts): 이전 10,000,000G, 이후 15,000,000G
  - 영향: 영향: 남대서양 대표 방치 EV 대비 일반 의뢰 보상 비율 정합성 유지(쉬움 3,000,000G·네임드 25,000,000G는 v0.19.3과 동일). 되돌리기: bounties.ts의 남대서양 보통·어려움 의뢰 보상을 5,500,000G·10,000,000G로 복원한다.
  - 커밋: f24417ea, d22799bf
- 1-4 마다가스카르, 1-5 남대서양, 1-6 북대서양 어종 가격을 해역별 균등 절대치 배율과 완만 브리지 곡선 기준으로 재조정하고, 1-5 남대서양 현상금 보상을 대표 방치 EV 기준으로 재산출해 밸런스 흐름 스냅샷·회귀 테스트를 갱신했다.
  - 어종 가격 재조정(src/game/content/fish.ts, fishPrice.test.ts): 프리셋 이동 보정 시 상위 등급 가격만 깎여 전설/영웅 비율이 2배대로 무너지던 왜곡을 해소하기 위해 모잠비크 해협 ×0.75(대왕 쥐가오리 53,000G·밤의 쥐가오리 110,000G), 코모로 심해 ×0.72(메가마우스 110,000G·칠흑의 메가마우스 220,000G), 남대서양 용승대 ×0.75(키안다 300,000G·칼룽가 600,000G), 세인트헬레나 ×0.75(갈라파고스 상어 560,000G·큰눈홍치 1,100,000G), 아조레스 해령 ×1.10(대서양철갑상어 1,700,000G·카웅 두 마르 3,300,000G), 버뮤다 삼각지대 ×1.00(루스카 3,500,000G·밤의 리본이악어 7,000,000G)로 조정했다.
  - 남대서양 현상금 보상 최종 정비(src/game/content/bounties.ts, bounties.test.ts): 세인트헬레나 대표 방치 EV 상승에 맞춰 1-5 남대서양 일반 의뢰 보상을 보통 6,500,000G, 어려움 15,000,000G로 상향하고, 중간 작업에서 20,000,000G로 내렸던 네임드 보상은 v0.19.3 기준 25,000,000G로 복원해 쉬움 3,000,000G·네임드 25,000,000G를 유지했다.
  - 1-4..1-6 어종 가격 균등화(fish.ts): 이전 상위 등급 단독 삭감 시안 가격(예: 메가마우스 80k, 키안다 100k, 갈라파고스 상어 180k, 아조레스 전설 1.5M), 이후 균등 배율·브리지 가격(모잠비크 ×0.75, 코모로 ×0.72, 용승대·세인트헬레나 ×0.75, 아조레스 ×1.10, 버뮤다 ×1.00)
  - 1-5 남대서양 현상금 보상 및 스냅샷·회귀 테스트(bounties.ts): 이전 쉬움 3,000,000 / 보통 5,500,000 / 어려움 10,000,000 / 네임드 25,000,000G(중간 20,000,000G 시안 경유), 이후 쉬움 3,000,000 / 보통 6,500,000 / 어려움 15,000,000 / 네임드 25,000,000G 및 밸런스 흐름 스냅샷 갱신
  - 영향: 영향: 1-4..1-6 전 해역 등급 분포(전설/영웅 약 5.6\~6.1배, 낮 전설/밤 영웅 비역전) 및 게이트 0위반 유지. 되돌리기: fish.ts·bounties.ts와 관련 테스트·밸런스 스냅샷을 이전 커밋 값으로 복원한다.
  - 커밋: d22799bf, 0b9d5fce

### 수정

- selectBagOverview에 선택적 bagBonus 인자를 추가하고, GameView와 GameTabs를 거쳐 BagTab으로 길드 가방 용량 보너스를 전달하도록 수정했다. 가방 탭의 물고기 상한과 가득 참 상태 판정이 헤더 자원 바·스탯 창과 같은 selectBagStatus(game, bagBonus) 계산 결과를 쓰도록 통일했다.
  - 가방 탭 상한 계산(selectBagOverview): 이전 selectBagStatus(game) (bagBonus 미전달, 기본 상한만 표시), 이후 selectBagStatus(game, bagBonus) (GameView → GameTabs → BagTab으로 길드 보너스 전달)
  - 커밋: 796c5828
- selectBoatPurchasePreview의 현재 가방 상한(currentBagCap)을 래칫 포함 보유 수량 기준에서 현재 배 기본 상한(capOfBoat) 기준으로 통일해 다음 배 기본 상한과 같은 축으로 비교하도록 수정했다. 실제 가방 상한 래칫과 길드 보너스 적용 동작은 그대로 유지했다.
  - 조선소 구매 비교 현재 가방 상한 기준(selectBoatPurchasePreview): 이전 bagCapacity(game.boat, game.bag), 이후 capOfBoat(game.boat)
  - 커밋: be2ee60a
- Field가 PC 레이아웃에서 게임 프레임 하단에 따로 절대 배치하던 낚시 상태 띠를 모바일과 같은 공용 statusSlot 포털로 통합하고, HudLayout이 상태 띠 슬롯, 오른쪽 아래 열, 메시지 창을 단일 흐름 컨테이너 안에서 배치하도록 수정했다. MessageLog의 단독 절대 배치와 stackTier의 중복 위치 클래스를 정리해 한 행 단계와 쌓기 단계 모두에서 요소 간 겹침을 없앴으며, 구조 가드와 단위 테스트를 추가했다.
  - PC 하단 HUD 낚시 상태 띠 배치: 이전 게임 프레임 하단 중앙에 따로 절대 배치(넓은 폭에서 미니맵·메시지 창과 겹침), 이후 HudLayout 단일 흐름 컨테이너의 공용 statusSlot에 배치해 한 행·쌓기 단계 모두 비겹침 보장
  - 커밋: 6ea81fe1
- selectInitialStatsSpotIndex에 현재 구역(currentZone)을 전달해 바다(world)에서 어군 사거리 밖일 때 마지막 해역으로 고정되지 않고 현재 바다 구역의 요구 파워 최고 해역을 선택하도록 수정했다.
  - 스탯 창 요약 탭 초기 해역 선택(selectInitialStatsSpotIndex): 이전 바다 어군 사거리 밖에서 항상 전체 마지막 해역 선택, 이후 현재 바다 구역 범위 내 요구 파워 최고 해역 선택
  - 커밋: ae689b1a
- fieldEngine에 거점 진입 래치(latchedBase)를 추가해 진입 거부 후 이동 입력을 모두 떼거나 경계에서 일정 거리(24) 벗어날 때까지 같은 거점 재진입 트리거가 반복 발동하지 않도록 수정했다.
  - 거부된 거점 재진입 판정(fieldEngine): 이전 이동 입력 유지 시 거점 진입 트리거가 반복 발동, 이후 입력 해제 또는 경계 이탈 전까지 같은 거점 재진입 차단
  - 커밋: 7b72468b
- 잠금 상태를 3상태(account, guest, unverified)로 분리해 세션 확인 실패 시 게스트 안내 대신 전용 문구('계정을 확인하면 쓸 수 있어요.')를 메뉴, 거점 시설, 판매 창 기운 얻기 탭, 채팅, 플레이어 정보, 내 정보, 개발자에게 창에 일관되게 적용했다.
  - 계정 확인 실패 상태 잠금 문안(AccountLockState): 이전 게스트와 구분 없이 게스트 연결 안내 표시, 이후 unverified 상태 분리 및 계정 확인 안내 표시
  - 커밋: c3c17b21, 49926db0
- 접힌 ChatBar의 상태 안내 문구에서 truncate를 제거하고 문장 경계마다 줄바꿈하는 formatStatusNotice를 적용해 두 문장 이상 안내가 말줄임 없이 모두 보이도록 수정했다.
  - 접힌 메시지 창 상태 안내(ChatBar): 이전 한 줄 말줄임(truncate)으로 뒤 문장 잘림, 이후 문장 단위 줄바꿈(formatStatusNotice, whitespace-pre-line)으로 전체 표시
  - 커밋: c3c17b21, 49926db0
- 익명 계정 정리 대상 선정과 단건 삭제가 공유하는 targetFrom 조건에 auth.accounts 행 부재(not exists) 검사를 추가했다. u.is_anonymous가 true로 남아 있더라도 구글 또는 이메일 로그인 수단이 연결된 계정은 선정과 삭제에서 제외되며, DB 회귀 테스트 픽스처(provider 지정)와 7일·365일 선정·단건 삭제 회귀 케이스 4종을 보강했다.
  - 익명 정리 대상 조건(targetFrom): 이전 u.is_anonymous만 확인해 로그인 수단이 연결된 계정도 익명 표시 잔존 시 포함 가능, 이후 auth.accounts 행이 없는 u.is_anonymous 계정만 선정·삭제
  - 영향: 영향: 로그인 수단이 연결된 계정이 익명 플래그 잔존으로 정리되는 문제를 막는다. 되돌리기: targetFrom의 auth.accounts not exists 조건을 제거한다.
  - 커밋: 397c8112
- 가방 용량 계산을 bagCapacityOf 단일 출처로 통일하고 반올림 ±1 오차와 스탯 창 배 탭 툴팁 및 구 수치 주석을 정비했다.
  - bagCapacityOf(effects.ts): 길드·유물 다중 보너스 적용 시 개별 delta 합산과 최종 cap이 1 차이나지 않도록 마지막 보정 항목 delta를 cap 기준으로 정렬했다.
  - 호출부 단일화: actions.ts(캐치·전시 회수), api/action.ts(fastCatch), selectBagStatus(selectors.ts, BagStatus.capStat 포함), rules.ts(canExhibit bagCap 인자)가 bagCapacityOf 단일 경로를 사용하도록 통일하고 미사용 bagCapBonusOf를 제거했다.
  - 배 탭 가방 용량 툴팁(BoatTab.tsx, RodStatTable.tsx, features/gameplay/model/statFormat.ts): digits=0일 때 천 단위 쉼표와 초과 보유(래칫) 안내를 순수 포맷 모듈로 분리해 툴팁 내역을 연결했다.
  - 주석 현행화: achievements.ts(진행 30종·15해역·25,862,500G, 누적 보너스 25종·7구역·23계열, 수령형 71종), features/achievement/model/achievements.ts(23장), world.ts(북대서양 p·9·하위 존 문자·항구 6곳) 구버전 주석을 코드와 일치시켰다.
  - 가방 용량 계산 및 배 탭 툴팁: 이전 bagCapBonusOf + bagCapacity 중복 조합 및 BoatTab 단순 숫자 표기, 이후 bagCapacityOf 단일 경로 + StatValue/statFormat 천 단위 쉼표 툴팁(미사용 bagCapBonusOf 제거)
  - 업적·세계 해역 주석: 이전 개편·북대서양 반영 전 26종/23종/항구 5곳 주석 잔존, 이후 현행 30종/25종/71종/항구 6곳 기준으로 정비
  - 커밋: 9df69e73, 6ce1ba8c, 1ad5eede
- 옷장 보유 업적 모자 출처 표시, 모자 스프라이트 픽셀 경계, 스탯 창 보너스 탭 유물 배율 및 업적·네임드 정합성 결함을 수정했다.
  - 옷장(wardrobe.ts, WardrobePanel.tsx): HatDetail에 source 필드를 추가하고 보유한 업적 모자에도 resolveHatUnlock으로 해금 업적 정보를 유지해 가격 0G 대신 '업적 보상 <업적 이름>'(미토벌 네임드는 가림)을 표시하며, 상세 칸 높이를 min-h-[84px]로 바꿔 긴 조건 문구가 세로로 확장되도록 했다.
  - 모자 스프라이트(actors.ts): strait-night-cap과 megalodon-silver-visor의 챙 폭을 5에서 4로 줄여 drawHead(6, 10) 기준 12x10 픽셀 경계 안에 맞추고 전체 46종 모자 경계 회귀 테스트를 추가했다.
  - 보너스 탭(artifactEffects.ts, stats.ts, BonusTab.tsx): 유물 행 포맷(artifactEffectValue, artifactEffectLine)에 achievementBonusesOf의 artifactBoost 배율(1 + artifactBoost)을 반영하고, 낚시 갈래의 단독 '보유 유물 효과' 행을 제거하는 대신 각 유물 행에 기본 효과·보유 유물 효과·적용 효과 내역 툴팁을 연결했다.
  - 업적·네임드 정합성(api/action.ts, api/_data/profile.ts, actions.ts, useGame.ts, GameView.tsx): clearQuestForAction으로 일반 의뢰는 deliverBounty, 네임드는 resolveChallenge 성공 시에만 bounty_clears에 기록해 이중 기록을 없애고, 공개 프로필 sanitizeClaimedAchievements가 현행 ACHIEVEMENTS에 없는 폐지 업적을 제외하도록 했다. debug achievement.evaluate 실행 시 applyAction 후처리 evaluateAchievements를 건너뛰어 reset 결과를 보존하고, 게스트 업적 토스트 차단 및 boot·import 2건 이상 소급 알림 1줄 요약(gold 톤), 거점 이동(resetPanels) 시 업적 모달 닫기를 함께 반영했다.
  - 옷장 보유 업적 모자 상세: 이전 고정 84px 높이, 보유 업적 모자에 가격 0G 표시, 이후 최소 84px 높이(min-h-[84px]), 해금 출처(업적 보상 <업적 이름>, 미토벌 네임드 가림) 표시
  - 모자 2종 챙 폭(strait-night-cap, megalodon-silver-visor): 이전 5px(drawHead 12x10 경계 초과), 이후 4px(12x10 경계 준수)
  - 스탯 창 보너스 탭 유물 배율 표시: 이전 유물 기본 수치만 표시하고 낚시 갈래에 단독 보유 유물 효과 행 배치, 이후 각 유물 행에 1 + artifactBoost 배율 적용 수치 및 기본/배율/적용 툴팁 표시, 단독 행 제거
  - 네임드 토벌 기록·공개 프로필·소급 알림: 이전 deliverBounty에서 네임드 bounty_clears 중복 기록, 폐지 claimed ID 노출, 게스트/boot·import 다건 토스트 폭주, 이후 resolveChallenge 단일 기록, 현행 ACHIEVEMENTS 필터, 게스트 차단 및 2건 이상 요약 1줄
  - 커밋: 0d3b27c7, af6c4986, bb564a71, ae9fc21a, ad5cc3ca, 27ea60b3, 7e9c9456
- F9 개발 도구 액션 페이싱 면제, 원자적 일괄 실행(debugBatch), 도감·수배·스냅샷 명령 정합화 및 Ingress·인증 요청 한도를 정비했다.
  - 요청 한도·인증 분리(k8s/prod/ingress.yaml, api/_auth/auth.ts, api/_auth/session.ts): /api/admin 전용 Ingress(pixel-fishing-admin-api, 50 rps, burst ×6)를 분리하고, Better Auth에 사설 프록시 대역 trustedProxies(ipAddressHeaders: x-forwarded-for, x-real-ip)와 관리자 /sign-in/social 한도 완화(10초당 20회), 관리자 세션 조회 disableCookieCache: true를 적용했다.
  - 개발 도구 페이싱 면제 및 일괄 실행(api/action.ts, api/_data/save.ts, actions.ts, actionSchema.ts, useDevTools.ts, httpGameGateway.ts): 개발·프리뷰 환경의 debug·debugBatch·debugSnapshot과 승인된 forceEncounter·forcePhase 캐치는 MIN_ACTION_GAP_* 및 catchTooSoon 검사를 면제한다. debugBatch(1\~50스텝)와 commitDebugBatch로 연속 debug 스텝을 단일 트랜잭션에 원자적으로 영속화하며, useDevTools 예외 시 tools.log에 오류를 기록하고 HttpGameGateway 풀재동기 시 patch.version을 함께 읽도록 수정했다.
  - 명령·스냅샷·로컬 모드 정합화(debug.ts, api/_data/bounty.ts, commands.ts, snapshots.ts, localGameGateway.ts, DevTools.tsx): dex.fill에 includeNamed(네임드 포함, UI 기본 true)를 추가하고 구 dex.completeZone은 UI 폼에서 숨겼으며, 역방향 초기화 시 revokeUnmetClaimableAchievements로 미수령 claimable 업적을 회수하고 achievement.resetCounters(resetAchievements: true)·achievement.evaluate의 즉시 재승격을 억제했다. named.unlock은 기본으로 직전 게임 날짜(previousGameDayISO)를 써 일일 한도를 소모하지 않게 했고, bounty.resetToday kind(all/general/named) 필터 및 DB-메모리 clearedNamed 동기화, debugSnapshot·snapshot.restore v2(bounty_clears/progress/tickets 원본 시각 복원 + v1 하위 호환), 로컬 모드 bounty.* debug-db-required 거부 및 안내 문구를 반영했다.
  - 관리자 Ingress·인증 프록시·세션 캐시: 이전 /api 단일 Ingress 버킷, trustedProxies·관리자 social 한도 규칙 미지정, 이후 /api/admin 전용 Ingress 분리(50 rps, burst ×6), trustedProxies·/sign-in/social 20회/10초·disableCookieCache: true
  - 개발 도구 페이싱·일괄 실행: 이전 debug·테스트 캐치에도 MIN_ACTION_GAP/catchTooSoon 적용, 프리셋 단계별 개별 왕복, 이후 허용된 개발 도구·테스트 캐치 페이싱 면제, debugBatch 단일 트랜잭션 일괄 실행
  - 도감·업적·수배·스냅샷·로컬 모드: 이전 dex.fill 네임드 미포함, 역방향 초기화 시 claimable 잔존, named.unlock 일일 한도 소모, v1 스냅샷만 지원, 로컬 bounty.* 무응답, 이후 includeNamed(기본 true), revokeUnmetClaimableAchievements, previousGameDayISO, bounty.resetToday kind 필터, v2 수배 스냅샷 복원, debug-db-required 거부
  - 커밋: 7d825c29

### 기타

- 게스트도 액션 확정 때 업적 카운터 증가와 claimable 저장을 받는다. 판정이 기록만 읽으므로 마을 격리 규칙과 부딪히지 않는다. 게스트에게는 메뉴 줄의 업적 항목을 잠그고 배지를 숨기며 수령 액션을 거절한다. 계정을 연결하면 게스트 때 쌓은 업적을 업적 창에서 받을 수 있다. 순위와 공개 표시에 업적을 쓰면 게스트와 제재 계정은 넣지 않는다.
  - 커밋: 4dee057b, 2d1eb62a
- 업적 카운터 기본 다섯 종(sell.gold, catch.perfect, catch.auto, catch.bait, named.flawless)과 수동 집계 동적 키(manual.total, manual.total.<구역>, manual.legendary.total, manual.legendary.<어종 id>, manual.variant.total, manual.variant.<최상위 구역>)를 표로 두었다. 열은 user_id, key, value(0 이상), updated_at이고 기본 키는 (user_id, key)다. 행 단위 보안을 켜고 정책을 두지 않아 서버 역할만 접근한다.
  카운터는 액션 확정 문장 안에서 상태 변경과 함께 오른다. 클라이언트 주장으로 올리지 않고, 확정이 거절되면 오르지 않는다. 같은 확정이 적재하는 events 행은 counted = true로 기록하고, counted = false 행은 카운터 도입 전 이벤트를 한 번만 소급하는 데 쓴다.
  서버는 초기 상태 응답과 상태 패치에 업적 카운터 값과 토벌한 네임드 식별자 목록을 함께 싣는다. 이 값은 saves_current.data에 중복 저장하지 않고, 정본은 achievement_counters와 bounty_clears다.
  도입 시점의 카운터 값은 모든 계정에서 0이다. 기존 이벤트의 소급 적재(events.counted가 false인 행)는 별도 작업이며 이 버전에는 없다.
  - achievement_counters 표: 이전 없음, 이후 user_id, key(기본 5종 + 동적 manual.*), value(0 이상), updated_at. 기본 키 (user_id, key). 행 단위 보안 켜짐, 정책 없음(서버 전용)
  - events.counted 열: 이전 없음, 이후 boolean not null 기본 false. 카운터 반영 여부 표시
  - 초기 상태 응답과 상태 패치: 이전 없음, 이후 achievementCounters와 clearedNamed를 함께 실음
  - 영향: 카운터 기반 업적의 진척은 도입 시점부터 쌓인다. 소급 적재 전에는 과거 판매와 캐치가 카운터 기반 업적에 반영되지 않는다. 되돌리려면 표와 열을 지우고 서버 응답 필드를 걷어내면 되지만, 그 사이 오른 카운터 값은 복구할 수 없다.
  - 커밋: 339f2fa5, de7aa671, 4dee057b
- 모두 받기의 액션 결과에 골드와 모자 목록을 싣는 ActionResult 변형(claimAllAchievements)을 더했다. 수령은 서버가 확정 상태를 다시 평가해 정하고, 클라이언트는 결과만 표시한다.
  화면의 새 업적 알림 판정을 순수 함수 newlyClaimable로 모아 액션 확정 경로와 첫 상태 적재 경로가 같은 함수를 쓰게 했다. 활동 로그 적재는 확정 응답의 상태 패치를 반영한 뒤에 한다.
  - 모두 받기 액션 결과: 이전 type과 상태만, 이후 { type: "claimAllAchievements", gold, hats }
  - 새 업적 알림 판정: 이전 없음, 이후 newlyClaimable(이전 상태, 이후 상태)
  - 커밋: 3d427529, 053b6576, de7aa671
- 밸런스 흐름 도구(pnpm balance:flow)의 업적 보상 산출식을 구역 대표 방치 EV 기준으로 바꾸고 관측 지표를 개편했다. achievementBasis 모듈을 없애고 achievement, report, dist, ev를 개편했으며, 테스트와 CLI 기대값을 새 산출식에 맞췄다.
  - balance:flow 업적 보상 산출: 이전 achievementBasis 모듈의 기준, 이후 구역 대표 방치 EV 기준(achievement 모듈)
  - 커밋: d9db19af
- 업적 판정을 업적 id 접두사 분기에서 선언적 규칙 카탈로그로 바꿨다. 규칙은 선택자(어종·구역·등급, id 집합), 측정 방식(discover, set, bigSpecies, catchCount, counter, counterSet), 목표(숫자 또는 'all'), 보상으로 정의하고, 목표 'all'과 구역 전설 목표 수는 게임 데이터(FISH, ZONES, BOUNTIES, ARTIFACTS)에서 계산한다. 화면과 서버는 같은 카탈로그와 순수 판정 함수(achievementProgress, evaluateAchievements)를 쓴다.
  횟수 탭 업적 41종을 데이터 기반 규칙으로 더해 모두 65종이 됐다. 기존 24종은 앞 순서 그대로 두고 확장 41종을 뒤에 붙였다. 확장은 수동 집계 키(manual.total, manual.legendary.total, manual.legendary.<어종 id>, manual.variant.total, manual.variant.<최상위 구역>), 기존 카운터 다섯 종(catch.perfect, catch.auto, catch.bait, named.flawless, sell.gold), 월척 종수(bigSpecies)를 읽는다.
  수동 집계 카운터는 액션 확정의 catch 이벤트에서만 오른다. 판정이 auto면 세지 않고, 전설이면 어종 id 키, 돌연변이면 최상위 구역 키를 함께 올린다. 어종과 구역은 이벤트의 fishId를 데이터에서 찾아 정하며 코드에 목록을 적지 않는다.
  동적 키는 카운터 맵 타입과 위생 처리(isAchievementCounterKey, manual.* 접두사)에서 보존한다. 빠른 캐치 경로는 이벤트 증분을 판정 전 상태에 반영해 새 카운터로도 claimable을 계산하고, 액션 경로는 정의되지 않은 증분 값을 거른다.
  - 업적 판정 방식: 이전 업적 id 접두사별 분기, 이후 규칙 카탈로그(선택자·측정 방식·목표·보상)를 읽는 공통 판정
  - 업적 수: 이전 24종, 이후 65종(기존 24종 + 횟수 탭 41종)
  - 업적 카운터 키: 이전 고정 5종(sell.gold, catch.perfect, catch.auto, catch.bait, named.flawless), 이후 고정 5종 + 동적 키(manual.total, manual.legendary.total, manual.legendary.<어종 id>, manual.variant.total, manual.variant.<최상위 구역>)
  - 카운터 위생 처리: 이전 고정 5종 키만 보존, 이후 고정 5종과 manual.* 접두사 키의 유한 비음수 정수 보존
  - 빠른 캐치의 claimable 판정 입력: 이전 카운터 증분을 판정 뒤에 합산, 이후 증분을 반영한 상태로 판정
  - 커밋: 9647a18, 7e719420, 2be101c2, bed3b7a2
- HttpGameGateway.reason의 거부 사유 코드 검사를 in 연산자에서 Object.hasOwn으로 바꿔 프로토타입 속성 키가 거부 코드로 통과하지 않게 했다. HttpGameGateway 단위 테스트에 델타 baseVersion 불일치·적용 실패 시 캐시 폐기 및 재동기화, 409 충돌 재시도, HTTP 오류 응답 처리 29건을 추가하고, DB 액션 테스트에 재화 변경 액션 9종 동시성 경합 및 7종 409 버전 충돌 미기록 검증 16건을 추가했다.
  - HttpGameGateway.reason 코드 판정: 이전 v in REJECT_TEXT (프로토타입 키 통과), 이후 Object.hasOwn(REJECT_TEXT, v)
  - 동기화·동시성 회귀 테스트: 이전 httpGameGateway 15건, action DB 112건, 이후 httpGameGateway 44건, action DB 128건
  - 커밋: f078bd1c
- Vitest 단위 테스트 설정에서 브라우저 전역 또는 React 렌더링에 의존하는 16개 파일(DOM_ONLY_TS_TESTS)과 .test.tsx만 dom(jsdom) 프로젝트에 남기고, 나머지 90개 비DOM .test.ts 파일을 node 프로젝트로 이관해 jsdom 초기화 부담을 줄였다(node 230개 / dom 121개 파일).
  - Vitest node 프로젝트 대상: 이전 game·shared·api·tools 140개 파일만 node 실행, 나머지 .test.ts는 dom 실행, 이후 DOM_ONLY_TS_TESTS 16개 예외를 제외한 .test.ts 230개 파일을 node 실행 (dom 121개)
  - 커밋: 7f299cfb
- 익명 표시가 남아 있어도 이메일 로그인(credential)이 연결된 계정이 7일 유휴·1년 미접속 정리 대상 선정과 단건 삭제에서 제외되는지 검증하는 실제 DB 회귀 테스트 5건을 보강했다.
  - 커밋: 955a6bb8
- HttpGameGateway에 parseVersion 헬퍼를 추가해 전체 상태 응답의 버전 누락 시 lastVersion을 초기화하고 델타 재동기화 실패 전에 기존 캐시를 선폐기하도록 보강했다. 프로토타입 키(__proto__) 거부 사유 검증과 쿠폰·업적·요리·우편 액션의 동시성 및 409 버전 충돌 미기록 DB 테스트를 추가했다.
  - HttpGameGateway 델타 캐시 초기화: 이전 전체 상태 무버전 시 이전 lastVersion 잔존, 델타 재동기화 실패 시 기존 캐시 잔존, 이후 parseVersion으로 무버전 초기화, 재동기화 호출 전 lastState·lastVersion 선폐기
  - 커밋: 5359c8f6
- Vitest 루트 설정의 jest-dom setupFiles를 dom 프로젝트 전용으로 분리하고, uiGuard 테스트에서 스테이지 모달 렌더링 테스트 3건을 별도 tsx 파일(stageModalWrapper.test.tsx)로 분리해 정적 가드(uiGuard.test.ts)를 node 프로젝트로 이관했다. node 프로젝트의 불필요한 setup 초기화를 제거해 실행 시간을 줄이고, 기본 입력 요소 감지 상수(RAW_INPUT) 회귀 테스트를 보강했다.
  - Vitest setupFiles 적용 범위 및 uiGuard 실행 환경: 이전 루트 setupFiles로 node·dom 공통 실행, uiGuard.test.ts를 dom 프로젝트 실행, 이후 dom 프로젝트 전용 setupFiles, uiGuard 정적 가드 node 이관 및 스테이지 모달 렌더링 tsx 분리
  - 커밋: 78df3d19
- 밸런스 분석 도구(pnpm balance, pnpm balance:flow)에 해역 단위 업적 보상 모드(--reward-unit spot), 월척 종수 도달 시간 분포(selfTimes p10·중앙값 및 dist --big-marks·--bounty), 구역 한정·유물 보유·유물 배율·판매가 효과 비교(effects --zone·--artifacts·--artifact-boost·--sell), 카운터 임계점 연동 보너스 관측(--counter-bonus)을 추가했다. 옵션을 지정하지 않은 기본 출력과 게이트 판정 계약은 그대로 유지했다.
  - balance:flow 관측 축: 이전 구역 단위 업적 보상, 단일 효과 축, 기본 전환 분포만 지원, 이후 해역 단위 보상, 월척 종수 분포, 구역·유물 배율 효과 비교, 카운터 임계점 보너스 관측 추가
  - 커밋: a18008c6, 166975bd
- 파생 값 단일 출처 원칙에 따라 효과 묶음 계약(PlayerContext, AchievementBonuses, NO_ACHIEVEMENT_BONUSES, createPlayerContext)과 핵심 값 규칙 함수 4종(bagCapacityOf, moveSpeedOf, biteWaitOf, saleProceedsOf), StatModSource 출처 메타데이터를 추가했다. 서버(api/_data/context.ts)·클라이언트(usePlayerContext)·밸런스 도구(tools/balance/context.ts) 3개 계층의 묶음 생성 함수를 두고, boundary.test.ts에 표현 계층의 게임 값 심볼 직접 import 차단(초기 허용 목록 및 stale 검사)과 effects.ts 공개 함수의 효과 기본값 금지 가드를 추가했다.
  - 효과 묶음 계약 및 값 규칙 함수: 이전 효과를 선택 인자(기본값)로 전달하며 계층별 묶음 생성기 없음, 이후 필수 PlayerContext 기반 값 규칙 함수 4종 및 서버·클라이언트·도구 3계층 묶음 팩토리 추가
  - 경계 가드 테스트(boundary.test.ts): 이전 계층 방향만 검사, 이후 표현 계층의 게임 값 심볼 직접 import 금지(초기 허용 목록·stale 검사) 및 effects.ts 효과 기본값 금지 추가
  - 커밋: 53eb8ce0
- 초반 첫 경험 보장(firstCatch)을 계정 단위 단일 카운터에서 마을 연못(pond: 5번째 금붕어, 10\~15번째 황금 잉어)과 마을 강(river: 5번째 무지개송어, 10\~15번째 강물고기) 해역별 독립 보장으로 개편했다. 바다 해역에는 적용하지 않으며, 진행 중인 구 단일 firstCatch 세이브가 빠른 캐치(fastCatch) 경로로 들어올 때 전체 도감 기준 이관 경로로 폴백해 강 보장 중복 지급을 막았다. action.db.test.ts의 대형 캐치 스냅샷 8건을 명시 단언으로 전환하고, 밸런스 오프닝 시뮬레이터(opening.ts)를 해역별 보장에 맞췄다.
  - 첫 경험 보장 단위 및 대상 어종: 이전 계정 단위 단일 카운터(5번째 영웅, 10\~20번째 전설), 이후 마을 연못·마을 강 해역별 독립 보장(각 5번째 지정 영웅, 10\~15번째 지정 전설)
  - 구 단일 firstCatch 이관 및 DB 테스트: 이전 단일 객체 이관 및 대형 스냅샷 8건, 이후 fastCatch 구 세이브 풀 경로 폴백 이관 및 명시 단언 전환
  - 커밋: 66bf98aa, 35c5fdb3
- 콜드 아카이브(api/cold-archive.ts)의 openStager에 파일 추적(track)과 안전한 스트림 종료·삭제(abort)를 추가하고, archiveEvents·archiveSaves를 try/finally로 감싸 0건·성공·업로드 실패 전 경로에서 gzip 스트림 종료와 임시 파일 삭제를 보장했다.
  - 콜드 아카이브 임시 파일 및 gzip 스트림 정리: 이전 0건·예외 경로에서 임시 파일·스트림 잔존 가능, 이후 try/finally로 전 경로 스트림 종료 및 임시 파일 정리 보장
  - 커밋: 01a4d201
- 업적 체계를 진행 26종(13개 해역 기초·숙련, min(1시간 방치 EV, 다음 해역 전환 골드 × 30%) 기준 총 5,362,500G), 즉시 자동 적용 누적 보너스 23종(전역 8계열, 구역 12계열, 최고 레벨 유물 1/3/6개 Lv5+전설 포함), 치장 모자 업적 41종(기존 14승계 + 네임드 다회 토벌 18 + 밤 도감 8 + big-100-hat 금바늘 대어 모자 1)으로 전면 개편했다. 폐지한 구역·횟수·수동 고정 골드 id와 big-100·big-200은 ABOLISHED_ACHIEVEMENT_IDS로 분리해 재사용을 막고, 수령 액션·요약 줄·메뉴 배지·업적 창 목록 대상이 현행 카탈로그(ACHIEVEMENTS)와 항상 일치하도록 맞추었다. 신규 업적 모자 27종 절차 스프라이트(총 46종), 3탭 업적 창과 다단계 카드 툴팁 내역, 스탯 창 BonusTab·StatValue '업적 누적' 단일 요약 연동, 옷장 미토벌 네임드 스포일러 가림, 플레이어 상세 업적 탭(진행·치장) 정합성, 밸런스 도구(gates 위반 0건, PERFECT/방치 최대 9.41배 <= 10배)와 DB 테스트 명시 단언 전환을 함께 반영했다.
  - 업적 카탈로그 및 보상 체계: 이전 구역 진행 10종 + 고정 골드 횟수·수동 41종 + 모자 14종, 이후 해역 진행 26종(5,362,500G) + 즉시 자동 누적 보너스 23종 + 치장 모자 41종(수령·배지·요약·탭 목록 단일화)
  - 업적 모자 및 옷장 스포일러 가림: 이전 업적 모자 14종(총 19종), 이후 업적 모자 41종(총 46종), 미토벌 네임드 모자 실명 가림
  - 업적 창·스탯 창·서버 페이싱 연동: 이전 4탭 수령형, 보너스 미적용, 이후 3탭+다단계 카드(툴팁 내역), PlayerContext·catchTooSoon·BonusTab 단일 요약 연동
  - 커밋: 4ab9ad6e, 79a21eb6
- 1-6 북대서양 신지역 구현(f24417ea)을 최신 dev(업적 개편 79a21eb6 포함)와 병합(e9b110fd)하고, 북대서양 신규 스프라이트 8종(5개 격자) 안전 여백(margin: 2) 위반을 수정(2cb86438)했다.
  - 지도: tools/configs/world.json 서단을 -15에서 -82로 확장(-82..157E, -36..44N, 956x232셀, GRID_OFFSET.col=392로 기존 좌표 보존), 버뮤다 섬(-64.8, 32.3) 등록, 미개방 해역 N 차단, earth.mask.ts·world.mask.ts 재생성.
  - 업적 연동: 진행 업적을 15개 해역 30종(azores 기초 3,000,000G·숙련 2,500,000G, bermuda 기초 7,500,000G·숙련 7,500,000G, 총 25,862,500G)으로, 누적 보너스를 7개 구역(23계열, 25종)으로 확장했으며 폐지 업적 유령 보상 차단 불변식을 유지했다.
  - 검증: pnpm test(360파일, spriteRules.test.ts 포함), tsc -b, oxlint, pnpm balance:flow gates(64통과/0위반) 통과 확인.
  - 세계 지도 항해 창 서단(world.json): 이전 -15E, 이후 -82E (956x232셀, GRID_OFFSET.col=392)
  - 진행·누적 보너스 업적 수: 이전 진행 26종(13해역, 5,362,500G), 누적 보너스 23종(6구역), 이후 진행 30종(15해역, 25,862,500G), 누적 보너스 25종(7구역)
  - 커밋: f24417ea, e9b110fd, 2cb86438
- 전진 마이그레이션 원칙에 따라 api/_dbTest/migrations.db.test.ts에서 역방향(.down.sql) 왕복 테스트 13건(0018, 0019, 0020, 0022, 0024, 0026\~0029, 0031, 0032, 0035, 0036)과 해당 테스트 전용 빈 describe 블록·미사용 헬퍼를 제거했다. 순방향 스키마·제약·RLS 검증 15건과 .down.sql 파일 36건은 그대로 보존했다.
  - 마이그레이션 DB 테스트(migrations.db.test.ts): 이전 순방향 15건 + 역방향 .down.sql 왕복 테스트 13건, 이후 순방향 스키마·제약·RLS 검증 15건 유지(.down.sql 테스트 0건)
  - 커밋: 1e6e83f6
- 밸런스 보고 진입점(tools/balance-report.ts)의 순수 지표 계산(ev, rod, income, idle, move, perfect, growth, journey, fame, monotonic, economy, dex, bounty)을 tools/balance/reportMetrics.ts로 분리하고 불변식·재현성 단위 테스트(tools/balance/reportMetrics.test.ts)를 추가했다. 또한 tools/balance/journey.ts와 tools/balance/flow/progress.ts가 공유하는 진행 스텝 상수·해금·구매·대기 판정·일반 폼 비율 헬퍼(STEP_SEC, opens, SpotProgress, buyForSpot, missingForSpot, normalFormShare)를 progress.ts에서 추출해 통합했다. 기본 pnpm balance 출력은 리팩터링 전과 바이트 단위로 동일하다.
  - 밸런스 보고 계산과 여정 시뮬레이션 구조: 이전 balance-report.ts 내 계산·출력 혼재, journey.ts와 flow/progress.ts 구매·해금 루프 중복, 이후 reportMetrics.ts 순수 계산 분리(+단위 테스트) 및 progress.ts 공통 진행 프리미티브 공유
  - 커밋: 1d162786
- 북대서양 어종 5종의 추상 관형절·미확정 영문 명칭을 실존 종 및 지역 전승 생물 이름과 로어로 개정하고, 관련 야간 변종 업적 모자 이름을 맞추었다.
  - 어종 5종 개명·로어 개정(src/game/content/fish.ts): 아조레스 해령의 블루잭(bluejack) -> 대서양 전갱이(백은 대서양 전갱이), 귀향하지 않는 것(unreturning) -> 대서양철갑상어(태고의 대서양철갑상어), 가라앉은 울림(sunkenecho) -> 카웅 두 마르(영겁의 카웅 두 마르), 버뮤다 삼각지대의 풀리지 않는 매듭(unraveledknot) -> 루스카(상고 루스카), 실종점(vanishingpoint) -> 밤의 리본이악어(극야의 리본이악어)로 어종 id를 보존한 채 이름·돌연변이명·로어를 교체했다.
  - 업적 모자 명칭 정렬(src/game/content/wardrobe.ts): 북대서양 밤 돌연변이 업적 보상 모자(vanishing-hood) 표시 이름을 '실종점 흑모자'에서 '극야의 흑모자'로 바꿨다.
  - 북대서양 어종 5종 이름·변이명·로어: 이전 블루잭, 귀향하지 않는 것, 가라앉은 울림, 풀리지 않는 매듭, 실종점, 이후 대서양 전갱이, 대서양철갑상어, 카웅 두 마르, 루스카, 밤의 리본이악어(변이명·로어 동반 개정)
  - 북대서양 밤 변종 모자 이름(vanishing-hood): 이전 실종점 흑모자, 이후 극야의 흑모자
  - 커밋: 8b2c7284, 455ba68a, 0b9d5fce

## [0.19.3] - 2026-11-17

### UI

- 미끼 조리 대기를 0초로 바꿔 조리를 시작하면 넣은 수량이 그 자리에서 모두 완성된다.
  cookingProgress가 대기가 0인 종류를 나누지 않고 모두 완성으로 계산하도록 고쳤고, 부엌 상세의 조리 시간 표시는 0분 대신 "즉시"로 보인다. 추가 완성분도 시작할 때 함께 들어간다.
  - 커밋: 13caf7db

### 밸런스

- 미끼 슬롯 지속을 30분에서 5분으로 줄이고 미끼 효과 값을 올렸다. 한 회 조리의 총 효과량은 이전의 1/4.5에서 1/3이 된다. 레시피 재료(기운 요구)는 바꾸지 않았고, 이미 보유한 미끼도 그대로 쓸 수 있다.
  - 미끼 슬롯 지속: 이전 30분, 이후 5분
  - 돌연변이 가중(사프란 미끼): 이전 +100%, 이후 +150%
  - 희귀 등급 미끼 가중: 이전 희귀·영웅·전설 +20%, 이후 희귀·영웅·전설 +40%
  - 영웅 등급 미끼 가중: 이전 영웅·전설 +40%, 이후 영웅·전설 +60%
  - 전설 등급 미끼 가중: 이전 전설 +60%, 이후 전설 +80%
  - 영향: 미끼 한 번으로 덮는 캐치 수가 줄어 도감 진행 기여는 이전보다 작다. 등급 가중은 합을 10000으로 맞추므로 확률은 효과 값에 비례해 오르지 않는다. 되돌리려면 COOK_KIND_RULES.bait.slotMs와 레시피 효과 값을 이전 값으로 돌린다.
  - 커밋: 13caf7db
- 미끼를 짧게 몰아 쓰는 형태로 바꾼다. 조리 대기가 0이 되어 즉시 완성되고, 슬롯 지속은 5분이다.
  조리 진행 계산은 대기 0을 따로 처리하고, 부엌 상세의 조리 시간은 "즉시"로 표시한다.
  - 미끼 조리 대기(1개당): 이전 1분, 이후 0초
  - 미끼 슬롯 지속: 이전 30분, 이후 5분
  - 사프란 미끼 돌연변이 가중: 이전 1, 이후 1.5
  - 롱페퍼 미끼 등급 가중: 이전 0.2, 이후 0.4
  - 큐베브 미끼 등급 가중: 이전 0.4, 이후 0.6
  - 용연향 미끼 등급 가중: 이전 0.6, 이후 0.8
  - 영향: 미끼 1회의 총 효과량은 5분÷30분에 효과 배율 1.33\~2를 곱한 값이라 이전의 1/4.5에서 1/3이다. 메인 밸런스 지표는 요리 효과 없이 재므로 게이트에는 영향이 없다. 되돌리려면 두 값을 이전 값으로 복원한다.
  - 커밋: 13caf7db

### 기타

- 밸런스 도구의 window 명령 기본 창이 미끼 슬롯 지속을 따라 5분이 되고, 등급 미끼와 돌연변이 미끼의 효과 옵션 기본값이 새 값(0.4, 0.6, 0.8, 1.5)을 쓴다.
  - 커밋: 13caf7db

## [0.19.2] - 2026-11-17

### 기능

- 배 표에 9단계 가공 플랜트선을 더했다. 여는 해역이 없고 속도는 220, 가방은 5,000이다. 그림은 배 스프라이트 생성기에 9단계를 더해 만들었고, 그림이 없는 배 단계는 빈 자리로 그리게 했다.
  가공 플랜트선(AUTO_ENERGY_BOAT = 9)을 가진 플레이어는 가방이 차서 개체 하나를 내보낼 때, 가방 상한 규칙이 고른 개체의 서식 해역이 해역 기운 대상 설정(기본 선택과 해역별 덮어쓰기를 합친 값)의 대상이면 놓아주는 대신 기운을 얻는다. 대상이 아니면 놓아준다. 판정은 planOverflow가 캐치 경로에서 하고, 내보낼 개체를 고르는 규칙은 바꾸지 않았다. 얻는 기운의 등급과 양은 판매 시설의 기운 얻기와 같다. 게스트는 배가 있어도 놓아준다.
  서버는 캐치와 함께 처리하고 기운으로 바꾼 개체를 autoExtractEnergy 이벤트로, 놓아준 개체를 autoRelease 이벤트로 따로 남긴다. 캐치 결과에 extracted(기운으로 바꾼 개체)와 energy(등급별 기운, 저장 단위)가 함께 온다. 실시간 안내는 "가방이 차서 {n}마리를 생명의 기운으로 바꿨어요.", 놓아준 개체가 함께 있으면 "가방이 차서 {n}마리를 생명의 기운으로 바꾸고 {m}마리를 놓아줬어요."다.
  - 배 단계 수: 이전 8척(대양 트롤선까지), 이후 9척(가공 플랜트선 추가)
  - 가공 플랜트선 값: 이전 없음, 이후 가격 12,500,000골드, 명성 하한 230,000, 속도 220, 가방 5,000, 여는 해역 없음
  - 가방 초과 때 내보내는 개체의 처리: 이전 언제나 놓아줌(autoRelease), 이후 가공 플랜트선을 가진 계정 플레이어는 기운 대상 해역의 개체면 기운을 얻고(autoExtractEnergy) 아니면 놓아줌. 게스트와 배가 없는 플레이어는 그대로 놓아줌
  - 캐치 결과: 이전 released(놓아준 개체), 이후 released에 더해 extracted(기운으로 바꾼 개체)와 energy(등급별 기운, 있을 때만)
  - 커밋: 26324723, cf4415c4, d18050ac, 12cad5b9, 8de302e9, 494c71ea
- autoExtractEnergy 이벤트의 payload는 uids, reason(bag-full), energy(등급별 기운, 저장 단위), fish(개체마다 uid, 어종, 폼)다. 방치 결과 보고 조회가 catch, autoRelease와 함께 이 이벤트를 읽는다. 관리자 지표의 이벤트 이름표에 자동 기운 얻기를 더했다.
  - 행동 기록 이벤트 종류: 이전 가방 초과는 autoRelease만, 이후 autoRelease(놓아준 개체)와 autoExtractEnergy(기운으로 바꾼 개체)
  - 커밋: cf4415c4, d18050ac, 0c3dbe55

### UI

- 도움말의 가방 항목에 가공 플랜트선 문단을 더했다. 가방이 가득 찼을 때 놓아줄 물고기 가운데 해역별 기운 대상으로 고른 해역의 물고기는 생명의 기운으로 바꾸고 나머지는 놓아준다는 것과, 얻는 양이 기운 얻기 탭과 같다는 것을 적었다.
  - 커밋: 0c3dbe55
- 방치 결과 요약(summarizeAway)이 autoExtractEnergy 이벤트를 세어 기운으로 바꾼 수와 등급별 기운을 낸다. 가방이 찬 시각은 첫 자동 방생과 첫 자동 기운 얻기 가운데 먼저 일어난 시각이다.
  알림 카드의 주황 줄은 기운으로 바꾸기만 했으면 "{t} 만에 가방이 차서 {n}마리를 생명의 기운으로 바꿨어요.", 놓아준 개체가 함께 있으면 "{t} 만에 가방이 차서 {n}마리를 생명의 기운으로 바꾸고 {m}마리를 놓아줬어요."다. 떠날 때 이미 차 있었으면 앞을 "가방이 이미 차 있어서"로 쓴다. 결과 창 가방 타임라인에는 "{n}마리를 기운으로 바꿈"을 더했다.
  - 가방이 찬 시각의 기준: 이전 그 기간의 첫 자동 방생 시각, 이후 첫 자동 방생과 첫 자동 기운 얻기 가운데 먼저 일어난 시각
  - 알림 카드 주황 줄과 가방 타임라인: 이전 놓아준 수만 표시, 이후 기운으로 바꾼 수와 놓아준 수를 있는 만큼 표시
  - 커밋: cf4415c4, 12cad5b9

### 밸런스

- 낚싯대 강화비를 레벨 구간별 두 식에서 단일 지수식으로 바꿨다(ROD.costBase 100, costGrowth 1.25, costPowerFrom과 costPowerExp 제거). 레벨당 파워(레벨 1이 10, 레벨마다 +5)는 그대로다.
  같은 커밋에서 입질 대기 단축을 레벨마다 최소와 최대 둘 다 ×0.94에서 강화마다 한쪽만 ×0.94(홀수 레벨에서 강화하면 최대, 짝수 레벨에서 강화하면 최소)로 바꿨다. 이 변경은 0.19.2-30에 적고, 관리자 안내는 0.19.2-19다.
  강화 한 번의 비용은 레벨 1, 2, 3에서 오르고 레벨 4부터 내린다. 누적 강화비는 레벨 5 도달까지는 새 식이 더 크고 레벨 6 도달부터 새 식이 더 작다.
  - 강화비 식(레벨 L에서 L+1): 이전 L이 15 이하이면 round(50 × 1.7^(L−1)), 16 이상이면 round(50 × 1.7^14 × (L/15)^8), 이후 모든 레벨에서 round(100 × 1.25^(L−1))
  - 강화 한 번의 비용(레벨 1, 2, 3, 4, 5): 이전 50, 85, 144, 246, 418, 이후 100, 125, 156, 195, 244
  - 강화 한 번의 비용(레벨 10, 15, 20, 30, 40, 50): 이전 5,929 / 84,189 / 840,940 / 21,552,362 / 215,280,534 / 1,283,171,975, 이후 745 / 2,274 / 6,939 / 64,623 / 601,853 / 5,605,194
  - 누적 강화비(레벨 6, 11, 16, 21, 27, 31, 41, 51 도달): 이전 943 / 14,329 / 204,388 / 2,335,456 / 23,441,069 / 83,114,206 / 1,068,047,330 / 7,787,441,602, 이후 820 / 3,324 / 10,967 / 34,293 / 131,949 / 322,717 / 3,008,864 / 28,025,566
  - 영향: 높은 레벨의 강화비가 크게 내려 해역 요구 레벨 상향(0.19.2-05)과 함께 진행 속도의 기준이 바뀐다. 이미 올린 레벨은 그대로이고, 옛 누적과 새 누적의 차액은 우편으로 보낸다(0.19.2-18). 되돌리려면 ROD의 강화비 값과 식을 이전으로 돌린다. 되돌리면 그 사이 새 비용으로 올린 레벨과 지급한 차액 우편은 남는다.
  - 커밋: 26637ae7
- 입질 대기 단축을 레벨마다 최소와 최대 둘 다 ×0.94에서 강화마다 한쪽만 ×0.94(홀수 레벨에서 강화하면 최대, 짝수 레벨에서 강화하면 최소)로 바꿨다. 레벨 1의 4\~8초는 그대로이고, 레벨 L의 최소 = 4 × 0.94^내림((L−1)/2), 최대 = 8 × 0.94^올림((L−1)/2)다. 타이밍 바 시간(1.4초)은 그대로다. 강화비 변경(0.19.2-04)과 같은 커밋이며, 관리자 안내와 방치 사이클, 네임드 조우 기댓값은 0.19.2-19에 있다.
  - 입질 대기 단축: 이전 레벨마다 최소와 최대 둘 다 ×0.94(레벨 L의 대기 = 4\~8초 × 0.94^(L−1)), 이후 강화마다 한쪽만 ×0.94(최소 = 4 × 0.94^내림((L−1)/2), 최대 = 8 × 0.94^올림((L−1)/2))
  - 레벨 12 입질 대기(최소\~최대): 이전 약 2.03\~4.05초, 이후 약 2.94\~5.52초
  - 영향: 같은 레벨의 입질 대기가 이전보다 길어 시간당 캐치 수가 줄어든다. 높은 레벨일수록 차이가 크다. 진행 전체의 영향은 0.19.2-19와 0.19.2-22에 적는다. 되돌리려면 rodStats의 감쇠 지수를 이전으로 돌린다.
  - 커밋: 26637ae7, 7d71213d
- 해역 요구 파워를 새 진입 레벨에 맞춰 다시 정했다. 요구 파워 = 10 + (진입 레벨 − 1) × 5다. 마을 연못(요구 없음)과 마을 강(레벨 3)은 그대로다. 나머지 11개 해역은 모두 올랐다.
  - 태평양 요구 파워(진입 레벨): 이전 30(Lv5), 이후 35(Lv6)
  - 마리아나 해구 요구 파워(진입 레벨): 이전 40(Lv7), 이후 55(Lv10)
  - 드래곤 홀 요구 파워(진입 레벨): 이전 50(Lv9), 이후 75(Lv14)
  - 코론 침선 지대 요구 파워(진입 레벨): 이전 60(Lv11), 이후 95(Lv18)
  - 그레이트 배리어 리프 요구 파워(진입 레벨): 이전 70(Lv13), 이후 115(Lv22)
  - 인도양 요구 파워(진입 레벨): 이전 80(Lv15), 이후 135(Lv26)
  - 남인도양 요구 파워(진입 레벨): 이전 95(Lv18), 이후 160(Lv31)
  - 모잠비크 해협 요구 파워(진입 레벨): 이전 105(Lv20), 이후 185(Lv36)
  - 코모로 심해 요구 파워(진입 레벨): 이전 120(Lv23), 이후 210(Lv41)
  - 남대서양 용승대 요구 파워(진입 레벨): 이전 130(Lv25), 이후 235(Lv46)
  - 세인트헬레나 요구 파워(진입 레벨): 이전 140(Lv27), 이후 260(Lv51)
  - 영향: 기존 플레이어는 낚싯대 레벨이 그대로라, 지금 낚던 해역의 요구 파워를 채우지 못할 수 있다. 강화비 인하(0.19.2-04)와 차액 우편(0.19.2-18)으로 다시 올릴 수 있게 했다. 방치 배수는 진입 레벨과의 차로 정하므로 해역마다 방치 수입 기준도 함께 바뀐다. 되돌리려면 해역 표의 powerReq를 이전 값으로 돌린다.
  - 커밋: 7d8e3f19
- 13개 해역 103종의 가격을 새 강화비와 해역 요구 레벨에서 산출한 확정 값으로 바꿨다. 51종이 내리고 48종이 오르고 4종은 그대로다. 앞 해역(마을부터 인도양까지)은 대체로 내리고 뒤 해역(남인도양부터)은 대체로 오른다. 가격 반올림 규칙 밖의 확정 가격(3,750, 12,500, 125,000 등)은 값 그대로 두고, 가격 규칙 테스트에 손으로 고정한 가격의 예외를 뒀다. 등급 가중치 규칙은 바꾸지 않았다.
  구역 대표 방치 EV(구역 마지막 해역의 진입 레벨, 낮밤 혼합)는 태평양 20,652에서 13,051, 동남아 71,282에서 60,479, 인도양 155,504에서 186,675, 마다가스카르 373,646에서 717,112, 남대서양 942,379에서 2,868,632가 된다.
  가격이 내린 어종의 가방 보유분은 보전하지 않는다.
  - 마을 연못 어종 가격: 이전 붕어 6, 피라미 4, 미꾸라지 5, 잉어 30, 금붕어 120, 황금 잉어 500, 이후 붕어 4, 피라미 3, 미꾸라지 3, 잉어 60, 금붕어 250, 황금 잉어 800
  - 마을 강 어종 가격: 이전 은어 7, 메기 9, 쏘가리 35, 연어 40, 무지개 송어 150, 강의 주인 800, 이후 은어 4, 메기 3, 쏘가리 60, 연어 65, 무지개 송어 300, 강의 주인 1,000
  - 태평양 어종 가격: 이전 고등어 10, 갈치 11, 참돔 75, 방어 80, 참치 360, 백상아리 2,200, 달무리 4,400, 이후 고등어 3, 갈치 4, 참돔 70, 방어 75, 참치 350, 백상아리 1,200, 달무리 2,400
  - 마리아나 해구 어종 가격: 이전 아귀 13, 심해 오징어 130, 실러캔스 520, 산갈치 530, 크라켄 3,000, 밤의 장막 6,000, 이후 아귀 5, 심해 오징어 120, 실러캔스 450, 산갈치 500, 크라켄 2,000, 밤의 장막 4,000
  - 드래곤 홀 어종 가격: 이전 가오리 18, 쥐치 20, 복어 350, 돛새치 1,300, 바다의 용 5,100, 달빛 문어 2,500, 야룡 7,900, 이후 가오리 6, 쥐치 5, 복어 150, 돛새치 600, 바다의 용 2,700, 달빛 문어 1,200, 야룡 5,400
  - 코론 침선 지대 어종 가격: 이전 곰치 19, 쏠배감펭 400, 나폴레옹 자리돔 1,000, 범상어 1,100, 철산호의 왕 5,000, 망령 농어 2,000, 밤의 철왕 8,000, 이후 곰치 7, 쏠배감펭 200, 나폴레옹 자리돔 750, 범상어 800, 철산호의 왕 3,800, 망령 농어 1,600, 밤의 철왕 7,600
  - 그레이트 배리어 리프 어종 가격: 이전 흰동가리 24, 나비고기 25, 호주 연어 28, 벤자리 26, 황제도미 550, 청줄돔 600, 산호의 왕 4,300, 부냅 4,600, 월광 산호어 1,100, 꿈의 왕 6,700, 이후 흰동가리 6, 나비고기 7, 호주 연어 8, 벤자리 7, 황제도미 500, 청줄돔 600, 산호의 왕 4,500, 부냅 5,000, 월광 산호어 1,200, 꿈의 왕 10,000
  - 인도양 어종 가격: 이전 만새기 29, 전갱이 27, 활치 31, 황다랑어 1,000, 청새치 2,600, 마카라 14,000, 야행 전갱이 2,000, 별지느러미 4,000, 바다의 거울 24,000, 이후 만새기 9, 전갱이 10, 활치 11, 황다랑어 600, 청새치 2,700, 마카라 12,000, 야행 전갱이 1,200, 별지느러미 5,400, 바다의 거울 24,000
  - 남인도양 어종 가격: 이전 꽁치 25, 정어리 27, 남방 오징어 680, 혼상어 770, 눈다랑어 3,200, 고래상어 3,700, 바루나 25,000, 서리밤 정어리 1,500, 오로라 물고기 5,500, 심연의 침묵 46,000, 이후 꽁치 21, 정어리 19, 남방 오징어 900, 혼상어 1,000, 눈다랑어 4,500, 고래상어 5,000, 바루나 30,000, 서리밤 정어리 2,000, 오로라 물고기 10,000, 심연의 침묵 60,000
  - 모잠비크 해협 어종 가격: 이전 날치 44, 가다랑어 46, 갑오징어 50, 왕고등어 2,100, 귀상어 9,500, 대왕 쥐가오리 74,000, 달빛 날치 4,200, 별 갑오징어 16,000, 밤의 쥐가오리 120,000, 이후 날치 26, 가다랑어 28, 갑오징어 29, 왕고등어 2,000, 귀상어 12,500, 대왕 쥐가오리 70,000, 달빛 날치 4,000, 별 갑오징어 25,000, 밤의 쥐가오리 140,000
  - 코모로 심해 어종 가격: 이전 등불고기 40, 심해 장어 43, 유리문어 2,300, 주름 상어 9,300, 도깨비상어 12,000, 메가마우스 78,000, 상층 등불고기 4,300, 심연 유리문어 16,000, 칠흑의 메가마우스 120,000, 이후 등불고기 40, 심해 장어 43, 유리문어 3,750, 주름 상어 24,000, 도깨비상어 27,000, 메가마우스 150,000, 상층 등불고기 7,500, 심연 유리문어 54,000, 칠흑의 메가마우스 300,000
  - 남대서양 용승대 어종 가격: 이전 남방 멸치 44, 남방 전갱이 47, 케이프 헤이크 49, 스노크 5,500, 부시리 26,000, 오렌지러피 26,000, 키안다 340,000, 밤의 헤이크 10,000, 칼룽가 540,000, 이후 남방 멸치 120, 남방 전갱이 135, 케이프 헤이크 150, 스노크 10,000, 부시리 60,000, 오렌지러피 65,000, 키안다 400,000, 밤의 헤이크 20,000, 칼룽가 800,000
  - 세인트헬레나 어종 가격: 이전 세인트헬레나 놀래기 62, 세인트헬레나 복어 64, 아폴로 자리돔 66, 어센션 엔젤피시 8,700, 와후 39,000, 갈라파고스 상어 520,000, 얼게돔 66,000, 큰눈홍치 840,000, 이후 세인트헬레나 놀래기 160, 세인트헬레나 복어 170, 아폴로 자리돔 180, 어센션 엔젤피시 30,000, 와후 125,000, 갈라파고스 상어 750,000, 얼게돔 250,000, 큰눈홍치 1,500,000
  - 영향: 가방과 전시대에 든 개체의 판매가가 반영 즉시 새 값으로 바뀐다. 내린 어종의 보유분은 보전하지 않는다(소급 보전 원칙의 예외). 방치 EV가 바뀌어 의뢰와 토벌 보상을 함께 다시 산출했다(0.19.2-09). 되돌리려면 어종 표의 price를 이전 값으로 돌린다. 그 사이 판 골드는 남는다.
  - 커밋: 8a3ade2c
- 배 8척의 가격을 확정 값으로 바꿨다. 지역 진입 배(조각배, 정크선, 증기선, 원양어선, 대양 트롤선)는 지역마다 10배씩 오르는 값이고, 지역 안 배(돛단배, 대양선)와 범선은 같은 지역 진입 배 가격의 1.1제곱을 유효숫자 두 자리로 반올림한 값이다(202.58은 200, 2,550.36은 2,600, 32,107.1은 32,000). 증기선과 대양 트롤선은 오르고 나머지 6척은 내린다. 속도, 가방, 이름, 그림, 세이브의 배 단계는 그대로다.
  쿠폰 출항준비의 골드를 새 조각배 값에 맞췄다.
  - 조각배 가격: 이전 300, 이후 125
  - 돛단배 가격: 이전 2,000, 이후 200
  - 정크선 가격: 이전 6,000, 이후 1,250
  - 범선 가격: 이전 4,500, 이후 2,600
  - 증기선 가격: 이전 9,500, 이후 12,500
  - 대양선 가격: 이전 80,000, 이후 32,000
  - 원양어선 가격: 이전 150,000, 이후 125,000
  - 대양 트롤선 가격: 이전 1,000,000, 이후 1,250,000
  - 범선부터 대양 트롤선까지의 가격 규칙: 이전 다음 해역으로 가는 전환에 드는 골드의 15%, 앞 두 자리 유효숫자의 둘째 자리를 0 또는 5로 반올림, 이후 지역 진입 배는 확정 표 값, 지역 안 배와 범선은 같은 지역 진입 배 가격의 1.1제곱을 유효숫자 두 자리로 반올림
  - 쿠폰 출항준비의 골드: 이전 300, 이후 125
  - 영향: 이미 산 배는 그대로이고 차액을 돌려주거나 걷지 않는다. 아직 사지 않은 플레이어는 증기선과 대양 트롤선에 골드가 더 들고 나머지 배에는 덜 든다. 되돌리려면 배 표의 price와 쿠폰 금액을 이전 값으로 돌린다. 그 사이 새 값으로 산 배는 남는다.
  - 커밋: 26324723
- 배의 명성 하한을 확정 표 값으로 바꿨다. 조각배는 0으로 그대로이고 나머지 7척은 모두 내린다. 명성은 밸런스 변수로 쓰지 않으며, 하한을 정하는 산식은 두지 않는다.
  - 돛단배 명성 하한: 이전 1,000, 이후 250
  - 정크선 명성 하한: 이전 3,500, 이후 1,500
  - 범선 명성 하한: 이전 5,500, 이후 1,800
  - 증기선 명성 하한: 이전 10,000, 이후 7,500
  - 대양선 명성 하한: 이전 30,000, 이후 9,000
  - 원양어선 명성 하한: 이전 55,000, 이후 25,000
  - 대양 트롤선 명성 하한: 이전 200,000, 이후 80,000
  - 영향: 명성이 모자라 배를 사지 못하던 플레이어는 반영 즉시 살 수 있게 된다. 배 명성 대기 ÷ 골드 대기 게이트의 알려진 예외(남인도양 1.33)가 없어졌다. 되돌리려면 배 표의 fameReq를 이전 값으로 돌린다. 그 사이 산 배는 남는다.
  - 커밋: 26324723
- 의뢰와 토벌 보상 20개를 새 구역 대표 방치 EV에서 같은 산식으로 다시 산출한 값으로 바꿨다. 보상 = 목표 시간(쉬움 1, 보통 2, 어려움 4, 네임드 8시간) × 구역 대표 방치 EV를 자릿수 반올림한 값이다. 태평양과 동남아는 내리고 인도양, 마다가스카르, 남대서양은 오른다. 의뢰 수량표는 바꾸지 않았다.
  - 태평양 보상(쉬움 / 보통 / 어려움 / 네임드): 이전 20,000 / 40,000 / 85,000 / 150,000, 이후 15,000 / 25,000 / 50,000 / 100,000
  - 동남아 보상(쉬움 / 보통 / 어려움 / 네임드): 이전 70,000 / 150,000 / 300,000 / 550,000, 이후 60,000 / 100,000 / 250,000 / 500,000
  - 인도양 보상(쉬움 / 보통 / 어려움 / 네임드): 이전 150,000 / 300,000 / 600,000 / 1,000,000, 이후 200,000 / 350,000 / 750,000 / 1,500,000
  - 마다가스카르 보상(쉬움 / 보통 / 어려움 / 네임드): 이전 350,000 / 750,000 / 1,500,000 / 3,000,000, 이후 700,000 / 1,500,000 / 3,000,000 / 5,500,000
  - 남대서양 보상(쉬움 / 보통 / 어려움 / 네임드, 네임드는 두 항목 모두): 이전 950,000 / 2,000,000 / 4,000,000 / 7,500,000, 이후 3,000,000 / 5,500,000 / 10,000,000 / 25,000,000
  - 영향: 수주 중인 의뢰도 완료 때 새 보상을 받는다(보상은 콘텐츠 표의 값을 그대로 더한다). 되돌리려면 의뢰 표의 reward를 이전 값으로 돌린다. 그 사이 받은 보상은 남는다.
  - 커밋: fc800800
- 0.19.2-04와 0.19.2-30의 관리자 안내다. 입질 대기는 레벨 1의 4\~8초에서 강화마다 최소와 최대 중 한쪽에 ×0.94를 곱한다. 레벨 L의 최소 = 4 × 0.94^내림((L−1)/2), 최대 = 8 × 0.94^올림((L−1)/2)다. 타이밍 바 시간(1.4초)은 그대로다.
  네임드 조우(확률 1/1000)의 기댓값은 레벨 12 방치 기준 약 1.8시간에서 약 2.1시간이 된다.
  - 강화비 식(레벨 L에서 L+1): 이전 L이 15 이하이면 round(50 × 1.7^(L−1)), 16 이상이면 round(50 × 1.7^14 × (L/15)^8), 이후 모든 레벨에서 round(100 × 1.25^(L−1))
  - 입질 대기 단축: 이전 레벨마다 최소와 최대 둘 다 ×0.94(레벨 L의 대기 = 4\~8초 × 0.94^(L−1)), 이후 강화마다 한쪽만 ×0.94(최소 = 4 × 0.94^내림((L−1)/2), 최대 = 8 × 0.94^올림((L−1)/2))
  - 레벨 12 입질 대기(최소\~최대): 이전 약 2.03\~4.05초, 이후 약 2.94\~5.52초
  - 레벨 12 방치 사이클(구현 주석 기준): 이전 약 6.4초, 이후 약 7.6초
  - 영향: 같은 레벨의 시간당 캐치 수가 줄어든다. 높은 레벨일수록 차이가 크다. 강화비가 내려 같은 골드로 더 높은 레벨에 닿으므로 진행 전체의 영향은 해역 전환 시간으로 본다(0.19.2-22). 되돌리려면 rodStats의 감쇠 지수와 ROD의 강화비 값을 이전으로 돌린다.
  - 커밋: 26637ae7, 7d71213d
- 0.19.2-05의 관리자 안내다. 요구 파워 = 10 + (진입 레벨 − 1) × 5이고 값은 해역 표의 powerReq다. 어종 가격(0.19.2-06)은 13개 해역 103종을 바꿨고 51종이 내리고 48종이 올랐다.
  - 해역 진입 레벨(태평양 / 마리아나 해구 / 드래곤 홀 / 코론 침선 지대 / 그레이트 배리어 리프): 이전 5 / 7 / 9 / 11 / 13, 이후 6 / 10 / 14 / 18 / 22
  - 해역 진입 레벨(인도양 / 남인도양 / 모잠비크 해협 / 코모로 심해 / 남대서양 용승대 / 세인트헬레나): 이전 15 / 18 / 20 / 23 / 25 / 27, 이후 26 / 31 / 36 / 41 / 46 / 51
  - 영향: 0.19.2-05와 같다. 반영 직후 요구 파워를 못 채워 앞 해역으로 돌아가는 플레이어가 생길 수 있고, 차액 우편(0.19.2-23)이 가기 전까지는 강화 골드가 모자랄 수 있다.
  - 커밋: 7d8e3f19, 8a3ade2c
- 0.19.2-07, 0.19.2-08, 0.19.2-01의 관리자 안내다. 의뢰와 토벌 보상의 새 값은 0.19.2-09에 있다(태평양 15,000 / 25,000 / 50,000 / 100,000, 동남아 60,000 / 100,000 / 250,000 / 500,000, 인도양 200,000 / 350,000 / 750,000 / 1,500,000, 마다가스카르 700,000 / 1,500,000 / 3,000,000 / 5,500,000, 남대서양 3,000,000 / 5,500,000 / 10,000,000 / 25,000,000).
  - 배 가격(조각배 / 돛단배 / 정크선 / 범선 / 증기선 / 대양선 / 원양어선 / 대양 트롤선 / 가공 플랜트선): 이전 300 / 2,000 / 6,000 / 4,500 / 9,500 / 80,000 / 150,000 / 1,000,000 / 없음, 이후 125 / 200 / 1,250 / 2,600 / 12,500 / 32,000 / 125,000 / 1,250,000 / 12,500,000
  - 배 명성 하한(같은 순서): 이전 0 / 1,000 / 3,500 / 5,500 / 10,000 / 30,000 / 55,000 / 200,000 / 없음, 이후 0 / 250 / 1,500 / 1,800 / 7,500 / 9,000 / 25,000 / 80,000 / 230,000
  - 쿠폰 출항준비의 골드: 이전 300, 이후 125
  - 영향: 0.19.2-07, 0.19.2-08과 같다. 이미 발급해 아직 쓰지 않은 출항준비 쿠폰은 쓸 때 새 금액을 준다.
  - 커밋: 26324723, fc800800
- 밸런스 도구 게이트 모듈의 알려진 예외 목록을 새 값으로 갱신했다. 확정한 값이 게이트를 벗어난 전환은 알려진 예외로 둔다. 이동 직후 수입의 예외 값은 새 해역과 비교 해역의 방치 시간당 골드 차이(낮 풀 / 낮밤 혼합)다.
  - 전환 시간 범위의 알려진 예외(인도양 / 모잠비크 해협 / 남대서양 용승대 도착): 이전 1.28 / 5.97 / 22.85시간, 이후 1.15 / 3.37 / 7.92시간
  - 이동 직후 수입의 알려진 예외(해역: 낮 풀 / 낮밤 혼합 차이): 이전 그레이트 배리어 리프 −604.36 / −577.26, 남인도양 −3,989.26 / −6,374.33, 코모로 심해 −42,614.75 / −60,618.06, 이후 태평양 −905.03 / −548.08, 드래곤 홀 −2,859.64 / −2,001.25, 인도양 −7,835.57 / −7,533.64
  - 배 명성 대기 ÷ 골드 대기의 알려진 예외: 이전 남인도양 1.33, 이후 없음
  - 전환 시간 순서의 알려진 예외: 이전 세인트헬레나 7시간, 이후 없음
  - 영향: 지역 진입 전환이 목표보다 빨라, 새 계정이 뒤 지역에 닿는 시간이 명세의 목표 범위보다 짧다. 태평양, 드래곤 홀, 인도양은 옮긴 직후 앞 해역보다 방치 수입이 낮다. 값을 다시 조정하면 게이트 모듈의 목록을 함께 갱신한다.
  - 커밋: 6b71909a

### 수정

- 막힘 안내(구역 경계, 열지 않은 바다, 배 부족 트리거, 게스트 출항 안내)의 재알림 판정을 blockNotice로 모았다. 이동 입력이 끊기거나 막힌 자리에서 일정 거리 벗어난 뒤 다시 닿을 때만 다시 알린다. 막혀 있는 동안에는 기준 자리를 마지막으로 막힌 자리로 갱신해 경계를 따라 미끄러지는 이동은 다시 알리지 않는다. 낚시 중인 프레임은 입력 끊김으로 보지 않는다.
  - 막힘 안내의 재알림 조건: 이전 막힌 채 이동을 이어 가면 반복해서 알림, 이후 이동 입력이 끊기거나 마지막으로 막힌 자리에서 일정 거리 벗어난 뒤 다시 닿을 때만 알림
  - 커밋: f32dfa1b, 048dc2ff
- 거점 트리거에 닿을 때 필드 엔진이 직전 프레임 자리를 되돌아올 자리로 함께 넘긴다. 이동이 거부되거나 실패해 필드에서 떠난 상태이면 그 자리로 복귀한다.
  - 거점 진입이 거부되거나 실패했을 때의 복귀 자리: 이전 진입 직전 자리가 아닌 자리, 이후 거점 트리거에 닿기 직전 프레임의 자리
  - 커밋: 4165c5b2
- 챔질 요청에 세대 번호를 두고 챔질과 낚시 접기마다 올린다. 이전 요청의 응답은 현재 던짐의 낚시 단계에 적용하지 않는다. 이전 응답이 포획이 확정된 응답이면 획득 안내 이벤트만 내고, 거절은 무시한다.
  - 낚시를 접은 뒤 도착한 이전 챔질 응답: 이전 현재 던짐의 단계에 적용, 이후 단계에는 적용하지 않고, 포획이 확정된 응답이면 획득 안내만 냄
  - 커밋: 161aaf93, 0b1735d7
- 오류 정책 표에 slot 표시를 더하고 안내 창이 없던 분류 세 가지(restricted, rate-limited, bug)에 지정했다. 실패 구독이 slot 종류의 정책 문구를 메시지 창에 알리고, 메시지 창이 접혀 있으면 오류 자리에 실패 안내를 보인다. 같은 문구를 두 번 알리지 않으며, 실패 구독이 끝나면 오류 자리의 안내도 지운다.
  - restricted, rate-limited, bug 분류 오류의 표시: 이전 안내 없음, 이후 메시지 창에 알림. 메시지 창이 접혀 있으면 오류 자리에 표시
  - 커밋: 15fbe295, 32a0623c, fb9a5476
- 세션 확인 실패를 게스트와 구분하는 상태(accountFailed)를 두고 메시지 창에 안내한다. 계정 관리 창은 확인 실패이면 안내와 다시 확인 버튼만 보이고 구글 연결, 이메일 로그인, 로그아웃, 계정 삭제, 약관 링크는 열지 않는다. 다시 확인의 세션 조회가 uid 없이 끝나면 세션 게이트를 덮지 않는다.
  - 세션 확인 실패 때의 계정 표시: 이전 게스트와 같게 표시, 이후 확인 실패로 표시하고 계정 관리 창에 안내와 다시 확인 버튼만 보임
  - 커밋: 0f8004c4, 9404c9ad
- 비교 표의 확정 후 값과 변화량 사이에 줄 바꿈 자리를 둬, 좁은 값 칸에서는 변화량이 아래 줄로 내려가게 했다.
  - 커밋: e6d8826d
- 판매 창의 확정 버튼 줄을 고정 높이 칸에 담아, 버튼 내용과 관계없이 두 탭의 확정 영역 높이가 같게 했다.
  - 커밋: 608fbfdd
- 마을 해역(마을 연못, 마을 강) 전용 방치 배수 표와 구역 분기를 없애고, 모든 해역이 방치 배수 표 하나(IDLE_BOOST_STEPS)를 쓰게 했다. 방치 배수는 방치 캐치에서 일반 등급 가중치에 곱하는 값이라, 배수가 작아진 마을 해역은 방치에서 희귀 이상이 나올 비율이 오른다. 게스트의 마을 제한, 배 0단계 가방, 도보 이동은 그대로다.
  관리자 밸런스 보고의 설명과 밸런스 도구도 단일 표로 맞췄다. 도구의 낚싯대 덮어쓰기는 village 키를 알 수 없는 키로 거부하고 world 키만 받는다.
  - 마을 해역의 방치 배수 표(레벨 차 0부터): 이전 10, 9, 8, 7, 6, 5, 4(마을 전용 표), 이후 레벨 차 0, 1, 2, 3, 4 이상에 5, 5, 4, 4, 3(모든 해역 공통 표)
  - 영향: 마을 연못과 마을 강의 방치 수입과 희귀 이상 비율이 오른다. 다른 해역은 바뀌지 않는다. 되돌리려면 방치 배수 규칙에 마을 전용 표와 구역 분기를 되살린다.
  - 커밋: b8b1e052, d7efe2ae, dbdee16c
- 실패 단계를 표시하는 inStage와, 단계, 오류 이름, 코드, 메시지, 원인 체인, 스택을 error 로그 한 줄로 남기는 logCronFailure를 더했다. 보관 작업의 조회, 임시 파일, 본문 조회, 업로드, 삭제 단계와 일별 집계 단계, 익명 계정 정리의 채팅 정리와 대상 선정 단계에 단계 표시를 붙였다. 로그 기록 중 예외가 나면 삼키고 단계만 남겨, 로그 기록이 실패 보고를 막지 않는다. 스택의 쿼리 인자 가림은 공용 함수 redactStackParams로 모았다.
  - 예약 작업 실패 로그: 이전 실패 단계와 원인이 error 로그에 남지 않음, 이후 단계, 오류 이름, 코드, 메시지, 원인 체인, 스택을 error 로그 한 줄로 기록(쿼리 인자 가림)
  - 영향: 예약 작업의 동작과 결과는 바뀌지 않고 실패 때의 로그만 늘어난다. 되돌리려면 단계 표시와 로그 호출을 걷어낸다.
  - 커밋: 95ef7f04, af0aacb6
- 이동(travel) 액션이 목적지 id를 콘텐츠와 대조해, 콘텐츠에 없는 지역이나 거점 id이면 bad-request로 거부한다(isKnownLocation). 이동 DB 테스트의 목적지를 실재 지역으로 바꿨다.
  - 없는 지역, 거점 id로의 이동 요청: 이전 거부하지 않음, 이후 bad-request로 거부
  - 커밋: 38f4fb28, e21b6b32

### 기타

- 기존 플레이어의 낚싯대 레벨은 바꾸지 않고 세이브 이관도 없다. 옛 누적 강화비에서 새 누적 강화비를 뺀 차액을 골드 우편으로 보낸다. 우편 발송은 코드 변경이 아니라 운영 작업이며, 패치 운영 배포 뒤 실행 직전 승인을 받고 한다.
  대상은 게스트가 아닌 저장 보유 계정이다. 금액은 배포 직전 낚싯대 레벨로 다시 계산하고 상한이나 감액을 두지 않는다. 새 누적이 더 큰 레벨(레벨 5 이하)은 보상이 없다.
  우편 제목은 "낚싯대 및 해역 밸런스 개편 보상"이고 본문은 세 줄이다. "낚싯대와 해역의 밸런스를 개편했어요." "낚싯대 강화 비용이 내려가고, 해역마다 요구 낚싯대 레벨이 달라졌어요." "이번 개편으로 기존 낚싯대 레벨로는 파워가 부족할 수 있으니, 받은 골드로 낚싯대를 강화해 주세요."
  - 기존 플레이어의 낚싯대 레벨: 이전 보유 레벨, 이후 그대로(이관 없음)
  - 강화비 차액 우편 금액(레벨별 예, 옛 누적 − 새 누적): 이전 없음, 이후 레벨 6은 123, 레벨 11은 11,005, 레벨 16은 193,421, 레벨 21은 2,301,163, 레벨 27은 23,309,120, 레벨 31은 82,791,489골드
  - 영향: 높은 레벨 계정은 차액이 크다(레벨 27 기준 약 2,331만 골드). 차액은 새 식에서 옛 누적 강화비와 같은 골드로 닿는 레벨까지 올릴 수 있는 양이다(레벨 27 계정은 새 식으로 레벨 50까지 올릴 수 있고, 세인트헬레나의 새 진입 레벨 51에는 조금 모자란다). 우편은 발송 뒤 되돌릴 수 없으므로 발송 전에 대상 수와 합계를 확인한다. 게스트는 받지 못한다.
  - 커밋: 26637ae7
- 0.19.2-18의 관리자 안내다. 우편 제목과 본문은 0.19.2-18의 내부 상세에 있다. 발송은 우편 보내기 명령이나 관리자 대시보드로 하며 이 버전의 코드에는 발송 로직이 없다.
  - 강화비 차액 우편: 이전 없음, 이후 운영 배포 뒤 계정 플레이어에게 옛 누적 강화비 − 새 누적 강화비를 골드로 발송(승인 뒤 실행)
  - 영향: 발송 전까지 기존 플레이어는 요구 파워를 못 채운 해역에 들어가지 못할 수 있다. 우편은 발송 뒤 되돌릴 수 없다.
  - 커밋: 26637ae7
- 밸런스 흐름 도구(pnpm balance:flow)에 업적 보상, 역산, 관측 명령을 더했다. achievements(업적 달성 시간과 보상 산출), solve(전환 역산), upgrades(강화 표), fame(명성 곡선), design(비용 기준 역산: 강화비 곡선과 해역 간격, 전환 시간 목표나 강화 한 번의 회수 시간에서 해역별 필요 진입 EV, 가격 배율, 등급 가격 비율, 배 가격, 요구 파워를 낸다)이다. ev에 해역 사이 방치 EV 증가율을 더했다.
  덮어쓰기(--override)는 낚싯대 규칙, 가상 해역, 등급 배율, 밤 어종 배율을 받는다. design은 해역별 회수 시간(--payback), 해역 배수 공식(--h-factor), 역전 허용폭(--reversal-tolerance), 방치 이득 제외 지표, 덮어쓰기 내보내기(--emit-override)를 받는다.
  이 묶음에서 더한 입질 대기 감소 방식 덮어쓰기(rod.biteDecayMode)와 design의 감소 방식 옵션은 0.19.2-28에서 없앴다.
  - balance:flow 명령: 이전 transition, days, opening, exception, ev, gates, dist, travel, effects, window, recipes, 이후 여기에 achievements, solve, upgrades, fame, design 추가
  - 커밋: eb0e267a, 4615ac38, 6bf6c211, 67536909, 49d73f73, 49155573, f5b1ac47, 12714ece, ffab846e, ec27836c, 914d3f46, ca9f074f, be05b79a, 51427afd, 07aface6, ebb9f825, 6433e711, b148c4b3, b38dc8ef
- 밸런스 개편 값에 맞춰 밸런스 도구와 테스트를 정리했다. 제품 규칙이 강화비 단일 식과 번갈아 단축으로 바뀌어, 낚싯대 덮어쓰기에서 없어진 규칙 키(rod.biteDecayMode, rod.costPowerFrom, rod.costPowerExp)와 design의 입질 감소 방식 옵션(--bite alternate|both)을 없앴다. 효과 옵션 --bite <N>은 그대로다.
  값에 묶여 있던 흐름 도구 테스트와 서버 스냅샷, 고정 입력을 제품 데이터에서 유도하거나 새 값으로 갱신했다. 레이아웃 검사의 최상위 배 이름 기대값을 가공 플랜트선으로 바꿨다. 스프라이트 대기 단계 제외 장치를 테스트에서 없앴다. 전환 모델은 다음 해역이 요구하는 배 단계까지만 배를 사므로, 여는 해역이 없는 가공 플랜트선은 전환 모델에 구매가 잡히지 않는다.
  - 낚싯대 덮어쓰기 키: 이전 rod.biteDecayMode, rod.costPowerFrom, rod.costPowerExp를 받음, 이후 세 키 제거
  - design의 입질 감소 방식 옵션: 이전 --bite alternate|both, 이후 제거(제품 규칙이 번갈아 단축 하나)
  - 커밋: 50e773a8, a90e0542, 58e0d6da, c7ee57a1, aee31462, d4b639c6, 4391d9a8
- 실시간 영역 테스트를 보강했다. 거부 이유가 없을 때 말풍선을 그리지 않는 단언을 되살리고, 메시지 창이 접힌 상태에서 요청 실패 안내의 표시와 우선순위를 고정했다.
  - 커밋: 3257260b, fb9a5476

## [0.19.1] - 2026-11-13

### 밸런스

- 요리 종류별 조리 대기(1개당)를 줄였다. 값은 콘텐츠 표 COOK_KIND_RULES의 waitMs이고, 슬롯 지속(slotMs)은 바꾸지 않았다.
  조리 상태는 시작 시각(startedAt)만 저장하고 완성 수는 조회 때 cookingProgress가 현재 waitMs로 계산하므로, 반영 시점에 이미 조리 중인 요리에도 새 대기가 적용된다.
  - 조리 대기(미끼 요리 1개): 이전 15분, 이후 1분
  - 조리 대기(도시락 1개): 이전 60분, 이후 15분
  - 영향: 조리 중인 요리는 시작 시각 기준으로 다시 계산되어 반영 직후 완성 수가 늘 수 있다. 결과 수량은 줄지 않는다. 되돌리려면 COOK_KIND_RULES의 waitMs를 이전 값으로 돌린다. 되돌리면 조리 중인 요리의 완성 수가 다시 계산되지만 이미 보관함으로 정산된 수량은 남는다.
  - 커밋: 2866b5f3
- 0.19.1-01과 같은 변경의 관리자 안내다. 콘텐츠 표 COOK_KIND_RULES의 waitMs만 바뀌었고 슬롯 지속(slotMs), 보관함 상한, 레시피 비용은 그대로다. 완성 수는 cookingProgress가 시작 시각과 현재 waitMs로 계산하고 settleCooking이 다음 조리나 먹기 때 보관함으로 정산한다.
  - 조리 대기(미끼 요리 1개): 이전 15분, 이후 1분
  - 조리 대기(도시락 1개): 이전 60분, 이후 15분
  - 영향: 반영 시점에 조리 중인 플레이어는 다음 조회 때 완성 수가 늘어난다. 저장 데이터 이관은 없다. 되돌리는 방법은 0.19.1-01과 같다.
  - 커밋: 2866b5f3

## [0.19.0] - 2026-11-13

### 기능

- 변경 이력의 정본을 체인지로그로 옮기고 제품 저장소의 패치노트 데이터를 생성물로 바꿨다.
  src/game/content/patchnotes.ts의 PATCH_NOTES 배열을 changelog-generated 표시 영역으로 감싸고 생성 도구의 gen 명령으로 생성한다. 생성물에는 public 항목만 들어간다.
  PatchNote의 visible 필드와 publicEntries 함수를 지우고, PatchNotesModal, newsFor, latestNewsAtOrBelow가 배열을 그대로 읽게 했다. 숫자 금지 검사는 제품 테스트에서 지우고 생성 도구의 --check로 옮겼다.
  저장소 루트에 CHANGELOG.md(생성물)를 추가했다.
  마이그레이션 0033으로 서버 전용 표 changelog_entries(RLS on, 정책 없음, tier는 public과 admin만)를 만들고 Drizzle 정의를 더했다. 관리자 조회 GET /api/admin?q=changelog와 AdminApi.changelog(), 운영 탭의 변경 기록 칸(ChangelogSection, groupChangelog)을 추가했다. 표의 데이터는 생성 도구가 내는 SQL로 환경마다 따로 넣는다.
  - 패치노트 데이터의 버전 수: 이전 58개(비공개 항목만 있는 버전 포함), 이후 50개(public 항목이 있는 버전만)
  - 패치노트 데이터의 비공개 항목: 이전 102개(visible: false), 이후 0개(체인지로그의 admin 항목으로 이동)
  - 공개 판정 위치: 이전 제품 코드 publicEntries 함수, 이후 생성 도구
  - 관리자 변경 기록: 이전 없음, 이후 운영 탭 변경 기록 칸, changelog_entries 표, GET /api/admin?q=changelog
  - 커밋: fc906c2, e7c10b8, d557183
- 게스트 허용 목록을 공유 규칙(guestActionVerdict)으로 두고 서버 액션에서 판정한다. 허용: 마을 지역과 집 사이 이동, 마을 수역 낚시, 판매, 낚싯대 강화, 배 구매, 튜토리얼 기록, 물고기 잠금. 마을 밖 이동과 낚시는 403 guest-village-only, 그 밖(닉네임 변경, 편지, 옷장, 모자, 의뢰, 쿠폰, 우편 받기, 전시대, 유물, 미끼, 차단과 신고)은 403 account-only. 마을 판정은 거점 지역 표(BASE_REGION)로 한다.
  랭킹(명성, 도감, 어종)에서 익명 계정을 뺀다. 실시간 채널은 게스트의 접속, 위치, 입력 중 표시를 중계하지 않고 게스트의 move를 마지막 위치로 저장하지 않는다. 게스트 공개 프로필은 본인 외 404.
  세션 생성 전 DB 훅이 ipAddress, userAgent를 비운다(게임과 관리자 인증 모두). 요청 수 제한의 IP 판별은 유지(테스트 추가).
  화면은 403 결과 코드를 제재와 구분해 계정 연결 안내 토스트를 보인다.
  운영 반영 시 할 일(사용자 승인 뒤): 바다나 해외 거점에 있는 게스트를 집으로 옮기는 일회성 패치(백업 표와 되돌리기 포함), 기존 세션 행의 IP와 브라우저 정보 비우기.
  - 게스트 플레이 범위: 이전 바다 포함 전체(채팅, 친구, 길드, 검색, 차단만 제한), 이후 마을 안 허용 목록만
  - 게스트 랭킹과 실시간 표시: 이전 노출, 이후 제외
  - 세션 IP와 브라우저 정보: 이전 저장, 이후 저장 안 함
  - 커밋: fbf8270e, 1247b06a, 32a54562, a3118af5, 95c963c1, 7dc27996
- 요리 순환을 추가했다. 콘텐츠 표는 src/game/content/cooking.ts(RECIPES, COOK_KIND_RULES, COOK_STORAGE_CAP), 판정은 src/game/rules/cooking.ts의 순수 함수(canCook, cookingProgress, settleCooking, canEat, appliedSlots, slotEffects)가 맡고 리듀서, 서버, 화면은 이 판정을 쓴다.
  해금은 배 단계에서 파생하고 저장하지 않는다(cookingUnlocked). 해금 단계 COOKING_UNLOCK_BOAT는 인도양 존의 진입 배 단계(5단계 증기선)에서 읽는다. 집 거점에 부엌 가구(kitchen)를 더했고 부엌 창은 도시락 탭과 미끼 탭으로 나뉜다. 기운 얻기는 판매 창의 탭이다(0.19.0-08).
  조리: 집에서만, 한 번에 레시피 하나만 조리한다(조리 중이면 cooking-busy). 시작할 때 레시피 기운을 수량만큼 차감하고 시작 시각을 서버 시각으로 둔다. 완성 수는 시작 시각과 서버 시각에서 파생하고(1개당 대기), 완성품은 다음 조리, 먹기 때 보관함(items의 레시피 id 행)으로 정산한다. 보관함 상한은 완성품과 조리 중 수량의 합이다(초과 시 storage-full). 기운이 모자라면 not-enough-energy.
  레시피 9종: 도시락 5종(가루디야, 민 몰리, 생선 비리야니, 암불 티얄, 생선 탈리), 미끼 4종(사프란, 롱페퍼, 큐베브, 용연향 미끼). 판정 칸 미끼(메이스 미끼)와 판정 칸 효과는 설계에서 뺐다. 처음 구현에는 있었고 1a19196f에서 레시피(cook-bait-judge), 영역 폭 효과 종류와 합산, 수동 판정 바에 효과를 넘기던 경로, 부엌 모델의 숨김 조건, 밸런스 도구의 판정 칸 처리, 미끼 스프라이트를 지웠다. 도시락과 미끼의 효과는 0.19.0-09, 0.19.0-10 항목에 적는다.
  서버 판정: 액션 extractEnergy, setEnergyTarget, resetEnergyTargets, cook, eat, dismissBaitRefund를 서버 리듀서가 판정하고, 액션 시각은 요청마다 서버 시각 하나로 정해 리듀서, 빠른 캐치 경로, 네임드 조우 추첨에 함께 쓴다. 클라이언트는 시각을 주장할 수 없다. cook, eat, setEnergyTarget, resetEnergyTargets, dismissBaitRefund는 가방 전체 읽기를 생략한다(SKIP_DETAIL). 게스트에게 요리 액션은 account-only로 닫고 dismissBaitRefund만 허용한다.
  세이브 v9: activeBait를 지우고 cooking(recipe, count, bonus, startedAt), slots(lunch, bait의 id와 endsAt), energyTargets, baitRefund를 더했다. 각 필드에 위생 처리(safeCooking, safeSlots, safeEnergyTargets, safeBaitRefund)가 있다. 이관 내용은 0.19.0-18 항목에 적는다.
  가방 탭 아이템 섹션을 ItemSection으로 바꿨다: 생명의 기운 4칸 격자, 도시락과 미끼 행의 먹기, 쓰기 버튼, 교체 확인 창, 해금 전과 게스트 잠금 칸. 거부 문구는 채택 문안으로 고정했다.
  - 요리 해금 조건: 이전 없음(기능 없음), 이후 배 단계 5(증기선, 인도양 진입) 이상, 집 거점의 부엌
  - 조리 대기(1개당): 이전 없음, 이후 도시락 60분, 미끼 15분
  - 보관함 상한: 이전 없음, 이후 완성품과 조리 중 수량의 합 10
  - 동시 조리: 이전 없음, 이후 레시피 하나, 수량 1 이상 정수
  - 세이브 버전: 이전 v8(activeBait 포함), 이후 v9(activeBait 제거, cooking, slots, energyTargets, baitRefund 추가)
  - 커밋: aaba19ae, 1418467c, f7a83d5a, 84f468b5, fcb9919e, 242a80e6, d6635abf, f55ae090, d279acb3, fe4547e9, 0a932bff, e86a2268, 5d1ef301, 80261560, 1a19196f, 8777cf9f
- 판매 창(집의 궤짝, 항구의 어시장이 여는 창)의 기운 얻기 탭(EnergyTab, FishPickTable)과 규칙(energyGain, applyEnergyGain, canExtractEnergy)을 추가했다. 기운 얻기는 판매 시설이 있는 거점(집, 항구)에서, 요리 해금 뒤에만 한다. 바다와 가방 초과 때의 자동 기운 얻기는 없고, 가방 초과는 놓아주기만 한다.
  장소 판정은 거점 표 SALE_BASES로 한다(지금은 여섯 거점 모두 판매 시설이 있고, 표와 거점 가구의 일치는 월드 테스트가 지킨다). 바다와 마을 필드에서의 요청은 422 not-at-sale-base로, 해금 전 요청은 422 energy-locked로 거부한다. 해역 선택 액션(setEnergyTarget, resetEnergyTargets)의 해금 전 거부도 energy-locked다(canUseEnergy). 조리의 장소 거부(not-at-home)와 조리, 먹기의 해금 전 거부(cooking-locked)는 그대로다.
  처음 구현은 집 부엌 창의 탭이었고 집 거점에서만 했다(거부 코드 not-at-home, cooking-locked). e50ae9a8에서 장소 판정과 거부 코드를, 530c0ff4에서 탭의 자리를 판매 창으로 옮겼다. 탭은 게스트에게 게스트 잠금, 요리 해금 전에는 진행 조건 잠금으로 보인다(energyTabLock, 게스트 잠금이 먼저). 탭의 화면 구성은 0.19.0-37 항목에 적는다.
  산출: 가방에 있고 잠기지 않았으며 콘텐츠에 있는 어종인 개체 1마리에서 그 어종 등급의 생명의 기운 1개. 어종, 크기, 폼은 산출에 영향이 없다. 중복 uid는 한 번만 센다. 기운 아이템 id는 energy-common, energy-rare, energy-epic, energy-legendary이고 items에 쌓인다.
  해역 선택(energyTargets): 배 단계로 갈 수 있는 해역을 해역 순서로 보이고, 기본값은 그 가운데 해역 순서로 가장 앞선 해역 하나만 끄고 나머지를 켠다(energyDefaultExcluded). 처음 구현은 가장 앞선 두 해역을 껐고 778ec54d에서 하나로 바꿨다. setEnergyTarget은 기본값과 같은 선택도 덮어쓰기로 저장하고, resetEnergyTargets는 덮어쓰기를 모두 지워 기본값으로 돌린다. 목록과 기본값 여부의 정의는 energyTargetRows 하나다.
  extractEnergy 이벤트 payload에 uids와 등급별 energy를 남긴다.
  - 기운 얻기: 이전 없음, 이후 판매 시설이 있는 거점(집 궤짝, 항구 어시장)에서 잠기지 않은 개체 1마리당 그 등급 기운 1개
  - 해역 기본 선택: 이전 없음, 이후 갈 수 있는 해역 중 가장 앞선 해역 하나만 끔, 해역별 덮어쓰기 저장
  - 기운 얻기의 장소 거부 코드와 문구: 이전 없음, 이후 422 not-at-sale-base, '집이나 항구에서만 할 수 있어요.'
  - 기운 얻기와 해역 선택의 해금 전 거부 코드와 문구: 이전 없음, 이후 422 energy-locked, '인도양 항로가 열리면 기운 얻기를 할 수 있어요.'
  - 커밋: aaba19ae, fcb9919e, d279acb3, fe4547e9, b1a01ce0, 515c7fb7, ac750465, 778ec54d, e50ae9a8, 530c0ff4, 29330e66
- 도시락 5종을 추가했다. 먹으면(eat) 도시락 슬롯에 들어가 9시간 동안 방치(auto) 판정 캐치에만 적용한다. 적용 범위의 단일 정의는 appliedSlots이고, 끝나는 시각 전이며 콘텐츠에 있는 요리일 때만 걸린다. 같은 슬롯에 새로 먹으면 이전 효과는 즉시 끝나고, eat 이벤트의 replaced는 이전 효과가 끝나기 전일 때만 남긴다.
  효과는 같은 대상의 다른 보너스와 더해 한 번 적용한다(slotEffects). 등급, 돌연변이, 네임드 가중은 서버 캐치 추첨(drawCatch)에 넘기고, 네임드 조우 가중은 길드 보너스와 슬롯 효과의 합(namedWeightBonus)이다. 입질 대기 단축은 클라이언트 fieldEngine이 직전 캐치가 auto인 대기에만 effectiveBite에 넘긴다(줄 거두기와 새 던짐에서 초기화).
  레시피(기운 비용, 효과):
  - 가루디야(cook-lunch-bite): 일반 600, 입질 대기 -10%(처음 구현은 일반 200이었고 778ec54d에서 확정했다)
  - 민 몰리(cook-lunch-rare): 일반 100, 희귀 20, 희귀 이상 등급 가중 +10%
  - 생선 비리야니(cook-lunch-mutation): 희귀 20, 영웅 4, 돌연변이 폼 가중 +50%
  - 암불 티얄(cook-lunch-named): 영웅 8, 네임드 조우 가중 +50%
  - 생선 탈리(cook-lunch-bundle): 일반 50, 희귀 5, 영웅 1, 전설 1, 입질 대기 -5%와 희귀 이상 등급 가중 +5%
  스탯 창: 보너스 탭에 효과가 든 슬롯의 요리 효과 줄(요리 이름 출처, 방치 낚시에만 표시)을 더했고, 해역 행의 입질 대기 보정에 도시락 단축과 요리 이름을 반영한다. 캐치 이벤트 payload에 걸린 도시락 id를 lunch 키로 남긴다(catchSlotInfo).
  조리 DB 테스트는 가루디야의 기운 시드량을 고정 숫자 대신 레시피 비용에서 계산한다(e49d1c9f).
  - 도시락 슬롯 지속: 이전 없음, 이후 먹은 시각부터 9시간
  - 도시락 적용 범위: 이전 없음, 이후 방치(auto) 판정 캐치만
  - 커밋: aaba19ae, f7a83d5a, fcb9919e, 242a80e6, ef256a03, 26d83145, fbcf0f0a, a8880383, 6388e821, 778ec54d, e49d1c9f
- 미끼를 소모형 활성 미끼에서 요리 슬롯으로 바꿨다. 이전: 향료전에서 골드로 사고, 활성 미끼 하나를 수동 캐치마다 1개 소모하며 대상 등급 가중치에 +100%(BAIT_WEIGHT_BONUS 1, 배수 x2)를 더했다. 이후: 부엌에서 기운으로 조리하고, 쓰면(eat) 미끼 슬롯에 들어가 30분 동안 수동 판정 캐치에만 적용하며 캐치마다 줄지 않는다.
  레시피(기운 비용, 효과):
  - 사프란 미끼(cook-bait-mutation): 영웅 4, 전설 1, 돌연변이 폼 가중 +100%
  - 롱페퍼 미끼(cook-bait-rare): 일반 50, 희귀 15, 희귀 이상 등급 가중 +20%
  - 큐베브 미끼(cook-bait-epic): 일반 50, 영웅 5, 영웅 이상 등급 가중 +40%
  - 용연향 미끼(cook-bait-legendary): 일반 50, 전설 3, 전설 등급 가중 +60%
  처음 구현의 수량은 사프란 미끼 전설 2, 등급 미끼 3종의 임시값(희귀 10, 영웅 2, 전설 1)이었다. 778ec54d에서 위 값으로 확정하고 임시값 상수(GRADE_BAIT_COMMON_COST, GRADE_BAIT_COST)를 지웠다.
  캐치 이벤트 payload에 걸린 미끼 id를 bait 키로 남긴다(catchSlotInfo).
  - 미끼 획득: 이전 콜롬보항 향료전에서 골드 구매(일반 25, 희귀 200, 영웅 1000, 전설 2500G, 1회 최대 50개), 이후 부엌에서 기운으로 조리
  - 미끼 소모: 이전 수동 캐치마다 활성 미끼 1개, 이후 쓸 때 1개, 슬롯 30분 동안 캐치마다 소모 없음
  - 미끼 효과: 이전 대상 등급 가중치 +100%(그 등급 하나), 이후 희귀 이상 +20%, 영웅 이상 +40%, 전설 +60%, 돌연변이 +100%
  - 미끼 적용 범위: 이전 수동 캐치(방치 제외), 이후 수동 판정 캐치만(appliedSlots)
  - 커밋: aaba19ae, f7a83d5a, fcb9919e, 242a80e6, 515c7fb7, d6635abf, 778ec54d
- 게임 인증에 구글 공급자를 더했다(api/_auth/googleLink.ts, auth.ts). 구글에 요청하는 범위는 openid와 email뿐이고 계정 선택 화면을 매번 띄운다. 연결한 적 없는 구글 계정으로는 가입하지 않는다(disableImplicitSignUp, disableSignUp). 이메일이 같다는 이유로 자동 연결하지 않고(disableImplicitLinking), 연결은 로그인한 사용자가 직접 한다.
  경로는 셋이다. 게스트의 구글 연결(표지 link-guest): 게스트 표시를 내리고 진행을 그 계정에 유지한다. 이메일 계정의 구글 연결(link-email): 다음부터 구글로 로그인한다. 구글 로그인(sign-in): 이미 연결한 구글 계정으로 그 계정에 들어간다.
  연결 전 검증(validateGoogleLink)과 결과 코드: 계정당 구글 하나(google_already_connected), 구글 계정이 다른 계정에 연결돼 있거나 이메일 계정이 고른 구글의 주소를 다른 계정이 쓰는 경우(account_already_linked_to_different_user), 게스트의 구글 주소가 구글을 연결하지 않은 이메일 계정의 주소와 같은 경우(email_account_exists), 게스트의 구글 주소를 다른 구글을 연결한 계정이 쓰는 경우(unable_to_link_account), 연결한 적 없는 구글로 로그인(signup_disabled).
  화면 분기는 googleFlow 모델(googleOutcome)이 복귀 주소의 표지와 오류 코드로 정한다. 게스트가 고른 구글 계정이 이미 다른 계정에 연결돼 있으면 그 계정으로 로그인해 게스트 진행을 버릴지 묻는 확인 창(GoogleOverwriteDialog)을 띄운다. 그 밖의 실패는 안내 창이나 토스트로 알린다. 복귀는 이 탭에서 시작한 흐름에만 반응한다(세션 저장소 표지).
  게스트 화면에는 구글 공식 규격의 버튼(GoogleButton, GoogleLogo), 만 14세 이상과 이용약관, 개인정보 처리방침 고지, 약관 링크(/terms, /privacy)를 둔다.
  연결 뒤의 계정 처리와 운영 설정은 0.19.0-31, 0.19.0-32, 0.19.0-33 항목에 적는다.
  - 게임 로그인 수단: 이전 게스트(익명), 이메일과 비밀번호, 이후 게스트(익명), 구글, 기존 이메일 계정의 이메일과 비밀번호(구글을 연결하기 전까지)
  - 게스트가 계정을 갖는 방법: 이전 이메일과 비밀번호로 승격, 이후 구글 계정 연결
  - 커밋: a5f3888e, 38e58969, c662c586, 6823479e, bd191cd8, 62cd2398, 653b94a9, 17afd559, 6cee78f7, f590dbcf, 91cefa5c, 6c54f960
- 관리자 인증 인스턴스(createAdminAuth)를 이메일과 비밀번호 로그인에서 구글 로그인으로 바꿨다. 관리자 인증 경로는 구글 로그인 시작(POST /api/admin/auth/sign-in/social), 콜백(GET /api/admin/auth/callback/google), 로그아웃만 열고 이메일 로그인 경로(/api/admin/auth/sign-in/email)는 지웠다.
  관리자 인증은 로그인만 한다. 계정 연결은 끄고(accountLinking.enabled false) 가입도 하지 않으므로, 게임 인증에서 구글을 연결한 적 없는 계정은 대시보드에 로그인하지 못한다. 관리자 권한 판정(관리자 명부)은 그대로다.
  로그인 화면(views/admin/access)은 공용 구글 버튼과 안내문을 보인다. 구글에서 돌아온 주소의 결과 코드를 읽어 주소에서 지우고, 이 탭에서 시작한 흐름에만 반응한다. 결과 코드별 안내(주소가 같은 이메일 계정이 있는 구글 계정은 연결 절차 세 줄, 알 수 없는 실패, 로그인 시작 실패의 429, 그 밖의 HTTP 실패, 네트워크 실패)를 googleSignIn 모델이 정한다. 구글 버튼은 놓인 칸의 폭을 채운다(6fbc5f91).
  연결하면 계정 이메일이 구글 주소로 바뀌므로(0.19.0-33) 관리자 사용자 목록의 이메일도 구글 주소로 보인다.
  - 관리자 대시보드 로그인 수단: 이전 이메일과 비밀번호(POST /api/admin/auth/sign-in/email), 이후 구글 로그인(POST /api/admin/auth/sign-in/social, GET /api/admin/auth/callback/google)
  - 대시보드 로그인 선행 조건: 이전 비밀번호가 있는 관리자 계정, 이후 게임 계정 관리에서 구글 계정을 연결한 관리자 계정
  - 영향: 운영 반영 뒤 관리자는 게임에서 구글 계정을 연결하기 전까지 대시보드에 들어갈 수 없다. 반영 직후 관리자 계정으로 게임에 이메일 로그인해 구글을 연결한다. 되돌리려면 이전 이미지로 되돌리는데, 이미 구글을 연결한 계정은 비밀번호 수단이 지워져 이메일 로그인으로 돌아갈 수 없다.
  - 커밋: 38e58969, c9b5f064, 278a00d9, cbd767dd, 6f3abdfa, b684f30c, 6fbc5f91, 31ecc23c
- 구글 연결 뒤의 마무리(finishGoogleLink, 계정 행 생성과 갱신 뒤 훅): 사용자 이메일을 연결 전 검증이 통과시킨 구글 주소로 바꾸고 이메일 확인됨으로 두며 게스트 표시를 내린다. 비밀번호 수단(credential 계정 행)을 지우고, 연결한 세션만 남기고 그 사용자의 다른 세션을 지우고, 아직 쓰지 않은 비밀번호 재설정 토큰을 지운다. 바꿀 것이 없으면 세션과 토큰을 건드리지 않는다. 같은 구글을 다시 연결하는 요청에서도 돌아 마무리가 끝나지 않은 계정을 마저 마무리한다.
  구글이 준 접근, 갱신, ID 토큰과 만료 시각은 저장 직전에 비운다(dropOAuthTokens). 게임은 구글 API를 부르지 않는다.
  요청 가드(guardAuthRequests, 게임과 관리자 인증 모두): 구글 인증 시작 요청의 scopes와 additionalParams 덮어쓰기를 400으로 거부하고, ID 토큰으로 하는 연결을 받지 않으며, 비밀번호 수단이 없는 계정의 재설정 토큰을 거부한다.
  재설정 메일(sendResetPassword)은 비밀번호 수단이 남은 계정에만 보낸다. 라이브러리의 재설정이 지운 비밀번호 수단을 되살리기 때문이다. 관리자 API resetLink는 비밀번호 수단이 없는 계정에 토큰을 만들지 않고 409 no-password로 답한다(게스트는 기존대로 409 anonymous-user).
  - 구글 연결 뒤 계정 이메일: 이전 해당 없음(구글 연결 없음), 이후 구글 주소로 변경, 이메일 확인됨
  - 구글 연결 뒤 비밀번호 수단: 이전 해당 없음, 이후 삭제. 다른 세션 종료, 쓰지 않은 재설정 토큰 삭제
  - 관리자 API resetLink의 거부: 이전 게스트 409, 인증 계정 없음 404, 이후 게스트 409 anonymous-user, 비밀번호 수단 없음 409 no-password, 인증 계정 없음 404
  - 비밀번호 재설정 메일 발송 대상: 이전 주소가 맞는 모든 계정, 이후 비밀번호 수단이 남은 계정만
  - 영향: 구글을 연결한 계정은 이메일과 비밀번호로 로그인할 수 없고 재설정으로도 비밀번호를 되살릴 수 없다. 연결은 계정 데이터에 쓰이므로 코드를 되돌려도 비밀번호 수단과 이전 이메일은 복원되지 않는다. 복원이 필요하면 운영 DB 백업을 근거로 보정한다.
  - 커밋: 38e58969, bd191cd8, 17afd559, c9b5f064
- 요리와 미끼의 스프라이트를 더했다. 요리(0.19.0-07)가 이 버전에서 처음 나가므로 플레이어에게는 따로 알리지 않는다.
  - 대상 정의: 요리(dish)와 미끼(bait) 대상에 16x16 격자, 네 변 안전 여백 2칸, 표시 프리셋(한 줄 표시 row, 상세 머리 hero)을 정했다. 부엌 레시피 목록용 프리셋(list)은 0.19.0-39 항목에서 더했다.
  - 그림: 도시락 5종과 미끼 5종의 원화 PNG와 생성 격자를 더하고, 요리 id로 스프라이트와 색을 찾는 해석 함수(itemSprite)를 뒀다. 미끼 가운데 판정 칸 미끼의 그림은 그 레시피와 함께 지워(0.19.0-07) 남은 것은 9종이다.
  - 화면: 요리 스프라이트 컴포넌트(ItemSprite)가 도시락은 요리 대상, 미끼는 미끼 대상의 프리셋을 읽는다. 가방 아이템 행, 부엌 레시피 목록 행, 레시피 상세 머리(접근성 이름 포함), 조리 상태 줄에 그린다.
  - 공통 규칙 검사 표와 에디터용 대상 정의 스크립트를 새 정의에 맞췄다.
  - 요리와 미끼 대상의 격자: 이전 미정(layout 없음), 이후 16x16, 안전 여백 2칸
  - 요리와 미끼의 표시 배율: 이전 없음(그림 없음), 이후 한 줄 표시 1배, 상세 머리 3배
  - 커밋: 4dafde57, bde107a4, 9dfdd8d4

### UI

- HUD 칩 줄에 도시락 칩과 미끼 칩(SlotChips)을 더했다. 칩 줄 순서는 접속 칩, 도시락 칩, 미끼 칩, 시계, 지도 버튼이다. 해금 전에는 잠금 칩을 보이고, 해금 뒤에는 효과가 든 슬롯의 칩만 남은 시간(시:분)과 효과 툴팁(RecipeEffectTip: 요리 이름, 효과 줄, 적용 낚시 안내)으로 보인다. 칩 줄은 포인터 이벤트를 통과시키고 칩 자신만 받는다. 이전 활성 미끼 칩은 지웠다.
  - 커밋: aaba19ae, 257d37c8, 82d1a6b9, 98e411f1
- 집 메뉴(BaseMenu)의 구역을 정보, 상점, 생활, 이동 순으로 하고 옷장과 부엌 카드를 생활 구역에 둔다. 부엌 카드는 게스트에게 계정 잠금, 요리 해금 전에는 진행 조건 잠금(인도양 항로가 열리면 쓸 수 있다는 줄과 항로가 열리는 배 단계 줄)으로 보이고 누르기 동작이 없다(menuLock, facilityProgress). 게스트 잠금이 진행 조건 잠금보다 먼저다.
  - 커밋: 1418467c, 97b393c7, eb52650e, 3a402ebb, 061a0429
- 게스트에게 닫힌 기능의 화면 표시를 공용 잠금 요소(Locked, LockLines, LockIcon, LockBadge)로 통일했다. 자리를 유지한 채 흐리게 두고 요소 모서리 바깥에 자물쇠를 붙이며, 마우스를 올리거나 누르면 공용 툴팁으로 잠금 줄을 연다. 누름은 동작하지 않는다. title 속성은 쓰지 않고 잠금 이유는 sr-only 설명과 aria-describedby로 보조 기술에 알린다.
  대상: 게임 메뉴의 의뢰, 길드, 소셜, 우편함 줄(잠긴 줄에는 배지와 알림 점 없음), 채팅 방 버튼과 입력 칸(마운트 뒤 입력이 있기 전에는 툴팁을 열지 않음), 편지 입력과 보내기, 플레이어 정보의 친구 요청과 차단, 계정 창의 닉네임 입력, 집 메뉴의 옷장 카드. HudInput의 자체 안내 칸은 지웠다. 게스트에게는 로그인 때 받지 않은 우편 안내를 띄우지 않는다.
  판정과 문안은 menuLock 모델(guestLock, GUEST_LOCK_TEXT '계정을 연결하면 쓸 수 있어요.')에 모았다. 잠금 적용 조건은 isGuest(계정이 없고 게임 서버가 있음)이고 로컬 모드에는 적용하지 않는다. 서버 거부 정책 문구(guest-village-only, account-only)와 친구, 길드 안내를 계정 연결 문구로 바꿨다. ui/guestLockGuard 테스트가 잠금 화면 전수 목록, 공용 구조 사용, title 속성 부재, 옛 문구 부재를 지킨다.
  - 게스트 거부 토스트(바다): 이전 계정을 연결한 뒤에 바다로 나갈 수 있어요. 설정 탭의 계정 관리에서 연결해 주세요., 이후 계정을 연결하면 바다로 나갈 수 있어요. 계정 관리에서 연결해 주세요.
  - 게스트 거부 토스트(계정 전용): 이전 계정을 연결한 뒤에 쓸 수 있어요. 설정 탭의 계정 관리에서 연결해 주세요., 이후 계정을 연결하면 쓸 수 있어요. 계정 관리에서 연결해 주세요.
  - 게스트 잠금 표시: 이전 화면마다 따로 처리(HudInput 자체 안내 칸 등), 이후 공용 잠금 요소와 menuLock 판정 하나
  - 커밋: 01f36908, 22cfcb3c, d9bb9d79, af244767, 79f10884, a5665f22, 97b393c7
- 도움말(VHelp)에 요리 토픽을 더했다. 기운 얻기, 요리, 먹기와 쓰기 세 단락이고, 슬롯 적용 범위 문구는 SLOT_SCOPE를 쓴다. 기운 얻기 단락은 집 궤짝이나 항구 어시장의 기운 얻기 탭을, 요리 단락은 집 부엌의 도시락 탭과 미끼 탭을 안내한다. 향료전과 활성 미끼 문구는 지웠고 도움말 마지막 갱신일을 바꿨다.
  - 커밋: aaba19ae, 1df31d43, 1743b311, 69538c7a
- 계정 관리 창(AccountModal)을 로그인 방식별 구성으로 바꾸고 닉네임과 ID를 새 창(MyInfoModal)으로 옮겼다. 설정 탭 계정 묶음에 내 정보 버튼을 더했다.
  계정 관리 창: 게스트는 구글 버튼과 고지, 접는 이메일 로그인 폼. 이메일 계정은 구글 계정 연결 구역(연결하면 이메일과 비밀번호로는 로그인할 수 없다는 경고 포함). 구글 계정은 로그아웃과 약관 링크. 로그인 방식은 계정에 붙은 로그인 수단을 조회해 정하고(useLoginMethod, loginMethodOf), 조회 중에는 연결 구역의 보이지 않는 사본으로 자리를 확보하며, 조회 실패 때는 안내와 다시 시도 버튼을 보인다. 로컬 모드에서는 연결 구역을 숨긴다.
  게스트의 이메일 계정 로그인 전에 게스트 진행이 사라진다는 확인 창을 띄운다. 이사 코드를 클립보드에 복사하던 동작은 지웠다.
  내 정보 창: 닉네임 변경과 내 ID 복사. 게스트의 닉네임 잠금 아이콘은 변경 버튼 오른쪽 같은 줄에 둔다.
  - 닉네임 변경과 내 ID의 위치: 이전 계정 관리 창, 이후 설정 탭의 내 정보 창
  - 계정 관리 창의 구성: 이전 이메일 가입과 로그인 폼, 닉네임, 내 정보(ID), 로그아웃, 이후 로그인 방식별 구성(게스트: 구글 버튼과 접는 이메일 로그인 폼, 이메일 계정: 구글 연결 구역, 구글 계정: 로그아웃)
  - 게스트의 이메일 로그인 때 이사 코드 복사: 이전 클립보드에 복사, 이후 없음
  - 커밋: a5e30714, b70407d7, 73cb99b6, de3f9008
- 집 거점의 생활 시설 라벨에 설명(sub)을 더했다. 집 메뉴의 옷장 카드와 부엌 카드가 제목 아래에 설명을 보인다. 공용 카드 테스트와 겹치는 집 메뉴 검증은 지웠다.
  - 옷장 시설 라벨: 이전 { title: '옷장' }, 이후 { title: '옷장', sub: '치장' }
  - 부엌 시설 라벨: 이전 { title: '부엌' }, 이후 { title: '부엌', sub: '요리/미끼' }
  - 커밋: 162c92be, 70c89ed3
- 게스트의 출항을 서버 거부 전에 포구에서 막는다. 필드 엔진(fieldEngine)이 확정된 게스트 여부와 게스트 이동 규칙 판정에 따라 마을 밖으로 나가는 트리거에서 장소를 바꾸지 않고 캐릭터를 직전 자리로 되민다. 서버에 이동 요청을 보내지 않는다. 되밀릴 때 막혔다는 이벤트를 한 번 알리고 막힌 채 밀고 있는 동안은 반복하지 않는다. 배가 없으면 기존 배 없음 안내가 먼저다.
  게임 화면(createGuestBlockedNotice)은 서버가 거부할 때와 같은 안내(GUEST_VILLAGE_ONLY_TEXT)를 메시지 창에 남기고 계정 관리 창을 연다. 계정 관리 창이나 다른 창이 떠 있으면 다시 띄우지 않는다.
  포구 차단은 계정 확인이 끝나 게스트로 확정된 경우에만 한다. 계정 확인 결과를 계정, 게스트, 확인 실패 셋으로 나누고(78599c54), 확인 전이나 확인 실패는 게스트로 확정하지 않고 서버 판정에 맡긴다. 서버가 이동을 거부했을 때의 복귀 위치는 장소 시작 지점 그대로다(6ffa438f).
  - 게스트가 포구에서 마을 밖으로 나가려 할 때: 이전 서버에 이동을 요청하고 거부(403 guest-village-only)되면 안내 토스트, 이후 클라이언트가 포구에서 되밀고 같은 안내를 남긴 뒤 계정 관리 창을 연다. 서버 요청 없음
  - 계정 확인 결과: 이전 계정 또는 게스트(확인 실패도 게스트로 처리), 이후 계정, 게스트, 확인 실패. 확인 실패는 게스트로 확정하지 않음
  - 커밋: 63f62692, 6ffa438f, 6f84c541, 78599c54, 0e9cfe40, 33d2eca7
- 판매 창(집의 궤짝과 항구의 어시장이 여는 창)을 한 열 구성에서 탭이 있는 두 칸 구성으로 바꿨다. 시설 창 안의 SellPanel을 지우고 SaleWindow(창과 탭), SellTab(판매 탭), PickTab(두 탭이 함께 쓰는 구성), 모델 saleWindow(SALE_TABS, saleWindowTitle, selectSaleTab, LOCKED_PICK_TIP)를 더했다.
  - 창: 부엌 창과 같은 920 폭, 높이 560px 고정이고 모바일 레이아웃에서도 가용 높이로 고정한다. 제목은 거점 판매 시설 가구의 windowTitle에서 읽는다.
  - 탭: 판매, 기운 얻기. 기운 얻기 탭은 부엌 창에서 옮겨 왔다(0.19.0-08). 게스트에게는 게스트 잠금, 요리 해금 전에는 진행 조건 잠금으로 보이고 눌러도 열리지 않는다. 공용 탭 바(TabBar)에 잠긴 탭을 더했다. 잠긴 탭은 aria-disabled라 키보드 포커스를 받고, 공용 잠금 툴팁(LockTip)과 보조 기술용 설명(LockReason)을 쓰며 호버 색이 걸리지 않는다.
  - 두 탭의 구성: 왼쪽 칸은 어종 표(FishPickTable), 오른쪽 칸은 위에 비교 표(CompareTable), 아래에 확정 영역(요약 줄, 안내 두 줄, 확정 버튼)이다. 두 탭의 줄 수가 같아 탭을 바꿔도 높이가 같다. 고른 것이 없어도 자리는 그대로 두고, 값이 바뀌지 않는 줄은 흐리게만 한다.
  - 판매 탭: 비교 표는 골드와 가방 마릿수의 현재와 판매 후(잠근 개체도 가방에 센다), 요약 줄은 판매할 물고기 마릿수, 안내는 판매한 물고기는 되찾을 수 없고 도감과 명성은 남는다는 두 줄이다. 판매 합계와 대상은 기존 가방 파생 데이터(selectSalePreview)가 정한다. 판매를 확정하면 창을 닫는다.
  - 기운 얻기 탭: 비교 표는 등급별 생명의 기운의 현재와 기운 얻기 후 네 줄, 요약 줄은 얻을 생명의 기운이다. 확정한 뒤에도 창은 열려 있다.
  - 잠근 개체: 확정 영역의 안내 문단을 없애고 어종 표의 자물쇠 툴팁으로 대신했다. 전부 잠긴 행, 잠긴 개체 줄, 전부 잠긴 크기 미상 묶음 줄이 같은 문안을 쓴다.
  - 마릿수는 천 단위 쉼표로 적는다(fmtFishCount). 두 탭의 선택 상태(판매 탭의 해제한 개체, 기운 얻기 탭의 직접 고른 개체)는 창이 들고 있어 탭을 오가도 남는다. 빈 가방 안내는 두 탭 모두 왼쪽 칸에 보인다.
  UI 가드: 화면 높이 여유 상한 예외 목록에서 판매 목록을 지우고, 어종 선택 표를 공용 표로 그리는지 보는 화면 목록을 판매 탭과 기운 얻기 탭으로 바꿨다.
  - 판매 창의 폭과 높이: 이전 기본 폭, 내용 높이(어종 목록 칸은 행 서른 개 높이 848px 상한), 이후 920 폭, 높이 560px 고정(모바일 레이아웃은 가용 높이 고정)
  - 판매 창의 제목: 이전 판매: 가방 (N마리), 이후 거점의 판매 시설 이름(집은 궤짝, 항구는 어시장)
  - 판매 창의 구성: 이전 한 열: 어종 표, 그 아래 잠근 개체 안내와 골드 증감 줄, 판매 버튼, 이후 탭 둘(판매, 기운 얻기)과 두 칸: 왼쪽 어종 표, 오른쪽 비교 표(현재, 판매 후)와 확정 영역
  - 잠근 개체 안내: 이전 확정 영역의 문단 '잠근 개체 N마리는 팔리지 않아요. 잠금은 가방 탭에서 풀 수 있어요.'와 자물쇠 툴팁 '잠금은 가방 탭에서 풀 수 있어요', 이후 어종 표 자물쇠의 툴팁 '잠근 개체는 고를 수 없어요. 잠금은 가방 탭에서 풀 수 있어요.'(문단 없음)
  - 기운 얻기 탭의 자리: 이전 집 부엌 창의 셋째 탭(오른쪽 칸 없음, 릴리즈 전), 이후 판매 창의 둘째 탭
  - 커밋: 530c0ff4, bed94e6c, 29330e66, 7df626aa
- 로어 문단 공용 컴포넌트(LoreParagraph)의 첫 글자 강조(골드, 1.25배 크기)를 선택 사항(emphasis)으로 바꾸고 기본을 끔으로 했다. 켜는 화면은 네임드 상세(도감 로어와 전승 문단)뿐이다. 어종 도감 상세(DexDetail)와 가방의 유물 상세(ArtifactDetail)는 강조 없이 그린다. 마지막 릴리즈(v0.18.3)에서는 세 화면 모두 강조했다.
  부엌 레시피 상세의 요리 설명(0.19.0-39)도 같은 컴포넌트를 강조 없이 쓴다.
  UI 가드: 로어 문단을 LoreParagraph로 그려야 하는 화면 목록에 유물 상세를 더하고, 강조를 켜는 화면이 네임드 상세뿐임을 검사한다.
  - 로어 문단의 첫 글자 강조(골드, 1.25배): 이전 어종 도감 상세, 유물 상세, 네임드 상세, 이후 네임드 상세만
  - 커밋: 67f8cc28
- 업데이트 소식 창의 표시 규칙을 다시 보지 않기 체크에서 마지막으로 본 버전 기준으로 바꿨다.
  - 대상(unseenNews): 마지막으로 본 버전 뒤부터 현재 버전까지 패치노트가 있는 버전 전부를 최신 순으로 한 창에 보인다. 버전 비교는 점으로 나눈 숫자 비교이고 노트 배열의 순서에 기대지 않는다. 이전에는 현재 버전의 소식 하나만 보였다(newsFor).
  - 기록: 기기별 저장값(localStorage pf-announcements)에 lastSeenVersion을 더했다. 소식 창이 보이는 때에 보인 가장 높은 버전을 기록하고 닫는 방식과 무관하다. 처음 시작한 플레이어는 창 없이 현재 버전까지 기록한다. lastSeenVersion이 없는 기존 저장값은 이전 형식의 dismissedVersion을 본 버전으로 쓰고, 둘 다 없으면 현재 버전의 소식 하나만 본다. dismissedVersion은 읽기만 하고 더 쓰지 않는다. 저장할 때는 저장소의 기존 값 위에 덮어써 모르는 필드를 보존한다.
  - 화면: 소식 창의 접속할 때 이 소식 띄우지 않기 체크를 없앴다. 버전이 하나면 버전 머리를 고정하고 목록만 스크롤하며(화면 높이 42% 상한), 여럿이면 버전 머리까지 한 스크롤 안에 잇는다(56% 상한). 설정 탭 패치노트의 최근 소식 다시 보기는 체크 없이 가장 최근 버전 하나를 연다.
  - 도움말의 업데이트 소식 안내 문구를 새 규칙에 맞췄다.
  - 접속 때 뜨는 소식의 범위: 이전 현재 버전의 소식 하나, 이후 마지막으로 본 버전 뒤부터 현재 버전까지 소식이 있는 버전 전부(최신 순)
  - 소식이 다시 뜨지 않는 조건: 이전 접속할 때 이 소식 띄우지 않기를 체크하고 닫음(체크하지 않으면 접속마다 뜸), 이후 창이 한 번 보이면 그 버전까지 본 것으로 기록(닫는 방식 무관)
  - 기기별 소식 기록: 이전 dismissedVersion, answered, 이후 lastSeenVersion 추가. dismissedVersion은 읽기 전용(lastSeenVersion이 없을 때만 기준)
  - 커밋: 7a16869c, c577e3fa, be82fd76
- 요리(0.19.0-07)의 부엌 창과 이름 표기를 정리했다. 요리가 이 버전에서 처음 나가므로 플레이어에게는 따로 알리지 않는다.
  - 부엌 창의 탭: 도시락, 미끼 둘이다. 기운 얻기 탭은 판매 창으로 옮겼다(0.19.0-08, 0.19.0-37).
  - 레시피 목록: 아이콘을 스프라이트 격자의 두 배(목록용 프리셋 list)로 그리고, 이름은 공용 표기로 적는다. 고른 레시피는 이름만 굵은 골드로 강조한다.
  - 레시피 상세: 머리는 큰 그림, 이름, 설명이다. 보유와 지속 시간 꼬리표를 없애고, 지속 시간은 효과 칸의 마지막 줄로, 보유한 완성 요리 수는 조리에 필요한 기운 표의 맨 아래 줄로 옮겼다. 효과 칸의 제목은 도시락 효과, 미끼 효과이고 표의 머리는 조리에 필요, 보유다. 조리 수량과 조리 시간은 한 줄에 둔다. 공용 상세 머리(HeroHeader)에 설명 자리를 선택 사항으로 더했다(두 줄 높이 확보, 꼬리표를 쓰는 화면은 그대로).
  - 요리 설명: 레시피에 설명 필드(description)를 더하고 아홉 종의 설명 문안을 넣었다.
  - 표시 등급: 등급 정의(RARITY)와 따로, 네 등급에 특수를 더한 표시 등급(DISPLAY_GRADE, DISPLAY_GRADE_ORDER)을 뒀다. 특수는 가중치, 명성, 도감에 쓰이지 않는 표시용이고 색 토큰은 --c-special이다. 돌연변이 가중 미끼(사프란 미끼)의 표시 등급이 특수다(recipeGrade).
  - 미끼 순서: 부엌 미끼 탭과 가방 아이템 섹션의 미끼 행을 등급순으로 놓고 특수는 뒤에 둔다(recipesOfKind). 이전에는 콘텐츠 순서라 사프란 미끼가 첫째였다.
  - 이름과 등급의 공용 표기(GradeName): 이름은 본문색, 괄호와 등급 낱말만 등급색, 굵기는 보통이다. 등급이 없는 대상은 이름만 쓴다. 레시피 목록과 상세, 조리에 필요한 기운 표, 판매 창 기운 얻기 탭의 비교 표, 가방 아이템 섹션의 미끼 이름에 쓴다. 이전에는 괄호 표기 전체를 등급색으로 칠했고 쓰는 곳이 한 곳이었다.
  - 문구: 가방 아이템 섹션의 생명의 기운 소제목 툴팁과 가방 탭의 잠금 토스트를 기운 얻기 장소와 대상에 맞게 고쳤다. 기운 얻기 탭 잠금의 해금 전 첫 줄은 규칙의 거부 문구(energy-locked)를 그대로 쓴다.
  - 스프라이트 에디터용 대상 정의 생성 파일을 목록용 프리셋에 맞춰 다시 썼다.
  - 부엌 창의 탭: 이전 도시락, 미끼, 기운 얻기, 이후 도시락, 미끼
  - 레시피 상세 머리: 이전 큰 그림, 이름, 꼬리표(보유 N개, 지속 시간), 이후 큰 그림, 이름, 설명
  - 레시피 목록 아이콘 배율: 이전 1배(row), 이후 2배(list)
  - 부엌 미끼 목록 순서: 이전 콘텐츠 순서(사프란, 롱페퍼, 큐베브, 용연향), 이후 등급순, 특수는 뒤(롱페퍼, 큐베브, 용연향, 사프란)
  - 사프란 미끼의 이름 표기: 이전 사프란 미끼(등급 표기 없음), 이후 사프란 미끼(특수), 괄호는 특수 색 --c-special #69f0ae
  - 이름과 등급의 공용 표기: 이전 이름과 괄호 전체를 등급색, 이후 이름은 본문색, 괄호와 등급 낱말만 등급색
  - 가방 탭의 잠금 토스트: 이전 '\~을 잠갔어요. 판매에서 제외돼요.', '\~의 잠금을 풀었어요. 다시 판매할 수 있어요.', 이후 '\~을 잠갔어요. 판매와 기운 얻기에서 빠져요.', '\~의 잠금을 풀었어요. 다시 고를 수 있어요.'
  - 생명의 기운 소제목 툴팁의 장소 안내: 이전 기운 얻기는 집 부엌에서 할 수 있어요., 이후 기운 얻기는 집 궤짝이나 항구 어시장에서 할 수 있어요.
  - 커밋: e03a9486, 67f8cc28, 530c0ff4, 4005f3a0, 69538c7a, cf128ab3, 29330e66

### 밸런스

- 유물 진주 상인의 저울(varuna-scale, 인도양 희귀)의 효과를 미끼값 할인에서 요리 추가 완성으로 바꿨다. 유물 효과 baitDiscount와 artifactEffectsAt의 해당 계산을 지우고, 요리 효과 cook.extraCookChance와 artifactExtraCookChanceAt, extraCookChance를 더했다.
  추가 완성: Lv1 값에 레벨 계수를 곱하고, 보유 유물의 확률을 더한 합은 1을 넘지 않는다. cook 리듀서가 조리를 시작할 때 수량마다 서버 rng로 추첨해 cooking.bonus에 저장하고, 완성된 수량만큼의 추가분을 보관함에 함께 넣는다. 추가분은 기운을 차감하지 않는다. cook 이벤트 payload의 bonus에 추가 완성 수를 남긴다.
  로어를 교체했다. 가방 유물 섹션과 효과 표기는 퍼센트포인트 표기로 보인다.
  - 진주 상인의 저울 효과(Lv1, 레벨 계수 적용): 이전 미끼값 할인 25%(baitDiscount 0.25), 이후 요리 1개마다 추가 완성 확률 10%(extraCookChance 0.1), 보유 유물 합 상한 100%
  - 영향: 미끼 구매가 없어져 저울의 이전 효과는 쓸 곳이 없어졌다. 새 효과는 요리 공급을 늘린다(기운 소비 없이 추가 완성). 되돌리려면 artifacts.ts의 varuna-scale cook 값을 바꾸거나 지운다.
  - 커밋: 1418467c, e9b1fce7, de97ac0f, 1f8c2857, 20736c1a, aaba19ae
- 가방 초과 때 놓아줄 개체의 순서(compareBlandness의 blandTuple)를 바꿨다. 등급 다음 기준을 폼에서 개체 판매가(priceOfInstance, 폼 배수 포함)로 바꿨다. 같은 어종에서는 변이가 일반보다 늦게 나가고, 더 싼 어종의 변이가 더 비싼 어종의 일반보다 먼저 나갈 수 있다.
  서버 빠른 캐치 경로(evictionCandidates)는 게임 계층의 어종 x 폼 판매가표(evictionPriceRows)를 json_to_recordset으로 조인해 (판매가, 크기, uid) 순으로 묶음별 후보를 고른다. 표에 없는 개체(삭제된 어종)의 판매가는 0이다. 클라이언트 비교자와 서버 SQL이 같은 기준을 쓴다.
  밸런스 측정 도구의 방생 순서도 같은 기준으로 맞췄다(0.19.0-21).
  - 놓아줄 개체 정렬 키: 이전 등급, 폼(일반 먼저, 변이 나중), 크기(미상 먼저), uid, 이후 등급, 개체 판매가(낮은 것 먼저, 폼 배수 포함), 크기(미상 먼저), uid
  - 서버 후보 선정 SQL 정렬: 이전 form asc, size asc nulls first, uid asc, 이후 coalesce(판매가, 0) asc, size asc nulls first, uid asc
  - 영향: 가방 초과 때 같은 등급 안에서 판매가가 높은 개체가 남는다. 놓아주는 개체 수와 등급 순서는 바뀌지 않는다. 되돌리려면 blandTuple의 둘째 키를 폼으로, evictionCandidates의 정렬을 form으로 복원한다.
  - 커밋: 5911f111, 06e22d88, cafb116d

### 수정

- 지원 코드와 의뢰 납품은 한 번만 쓰는 행(reliefs의 활성 코드, bounty_progress의 진행 행)을 소비한다. 이전에는 액션의 읽기 단계에서 그 행을 먼저 소비(코드 비활성화, 진행 행 삭제)하고 규칙을 실행한 뒤 저장을 확정했다. 소비와 확정이 다른 문장이라, 확정이 낙관 락 경합(409 version-conflict)이나 오류로 실패하면 소비만 남고 보상은 저장되지 않았다. 재시도는 이미 소비된 행을 보고 거부됐다. 마지막 릴리즈(v0.18.3)의 서버도 같은 순서다.
  소비를 저장 확정과 함께 일어나게 바꿨다. 소비 방식의 상세와 응답 코드는 0.19.0-34 항목에 적는다.
  - 지원 코드 소비 시점: 이전 읽기 단계에서 먼저 비활성화, 그 뒤 저장 확정(별도 문장), 이후 규칙 실행 뒤 저장 확정과 같은 트랜잭션. 확정이 실패하면 소비도 되돌려짐
  - 납품 진행 행 소비 시점: 이전 읽기 단계에서 먼저 삭제, 그 뒤 저장 확정(별도 문장), 이후 저장 확정 문장 안에서 삭제. 확정이 어긋나면 행이 남음
  - 커밋: 34f81775, d7ecaf26, 549c7080, fb04208f
- 한 번만 쓰는 행의 소비를 액션 확정으로 옮겼다(api/action.ts, api/_data/commit.ts).
  지원 코드: 읽기 단계에서는 지급분만 읽는다(findRelief). 다른 계정과 같은 행을 다투므로 commitConsumingCode가 소비(consumeRelief, 활성 코드의 조건부 비활성화)와 확정 문장을 한 트랜잭션으로 묶는다. 소비를 먼저 실행해 행 잠금으로 경합 요청을 줄 세우고, 확정이 낙관 락 경합이면 소비까지 되돌린다. 이미 다른 요청이 소비했으면 아무것도 쓰지 않는다.
  납품: 같은 계정의 요청끼리만 다투므로 commitGated가 한 문장으로 확정한다. versionUpdate의 조건에 진행 행이 있어야 한다는 선행 조건(deliveryGate)을 넣고, 같은 문장의 조각(consumeDeliveryFragment)이 진행 행을 지운다. 아무것도 쓰이지 않았으면 선행 행을 문장 밖에서 다시 읽어 행이 없으면 422, 있으면 409로 가른다. 성공 경로의 문장 수와 왕복 수는 그대로다.
  페이싱 검사는 코드 조회보다 먼저 한다(거절될 요청이 코드 조회까지 가지 않게). DB 테스트(action.consume.db.test.ts): 버전 충돌 때 소비 보존과 재시도 지급, 경합 요청의 단일 지급, 이미 쓴 코드와 미완료 납품 거부, 확정 문장 오류 때 소비 되돌림.
  - 지원 코드 액션의 확정 결과: 이전 선소비 뒤 확정. 확정 실패는 409, 코드는 소비된 채 남음, 이후 소비와 확정이 한 트랜잭션. 이미 소비됨 422 relief-invalid, 낙관 락 경합 409 version-conflict(소비 되돌림)
  - 납품 액션의 확정 결과: 이전 선소비 뒤 확정. 소비에 진 요청은 리듀서가 422, 확정 실패는 409이고 진행 행은 지워진 채 남음, 이후 한 문장으로 확정. 진행 행 없음 422 quest-incomplete, 낙관 락 경합 409 version-conflict(진행 행 남음)
  - 커밋: 34f81775, d7ecaf26, 549c7080, e4730f01, fb04208f
- 구글 로그인(0.19.0-25)과 계정 관리 창(0.19.0-26)의 후속 보정이다. 대상 기능이 아직 릴리즈되지 않아 플레이어에게 고친 오류로 알리지 않는다.
  - 이메일 로그인 실패를 폼 안 안내로 알린다. 인증 어댑터가 실패를 코드(invalid_credentials, over_email_send_rate_limit, validation_failed, network)로 가르고 흐름 모델(emailSignInFailureLines)이 코드별 안내 줄을 정한다. 서버에 닿지 못해 던져진 오류도 실패 결과로 돌린다. 안내는 폼의 버튼 아래에 문장마다 한 줄로 보이고, 다시 시도하거나 폼을 접으면 지운다. 서버 원문 오류는 보이지 않는다.
  - 폼을 펴는 줄의 이름을 기존 이메일 계정으로 로그인으로 바꾸고, 같은 이름을 부르는 구글 연결 안내를 맞췄다. 요청 과다 문구의 잠시 후를 잠시 뒤로 통일했다.
  - 낚은 적 없는 게스트는 계정 전환 확인 창을 건너뛴다. 기준은 누적 낚은 수(도감의 모든 종과 폼의 낚은 수 합) 0이고(guestHasNoProgress), 낚은 수가 숫자로 읽히지 않는 행이 있으면 진행이 있는 것으로 본다. 게스트 진행은 reading, nothing, some으로 가르며(guestProgress) 저장을 읽기 전의 기본 상태를 진행 없음으로 보지 않고, 읽지 못했으면 진행 있음으로 보아 확인을 거친다. 이미 다른 계정에 연결된 구글 계정을 고른 경우와 기존 이메일 계정 로그인에 적용한다. 확인을 건너뛰는 이메일 로그인은 요청 직전에 서버 저장 상태를 다시 읽어 판정하고, 다시 읽는 동안 로그인 버튼과 폼을 접는 줄은 눌리지 않는다.
  - 확인 없이 시작하는 구글 로그인 이동이 예외로 끝나도 시작 실패 안내를 보인다.
  - 구글 버튼 글자는 게임 본문 서체의 굵은 글씨를 쓴다(기기 서체의 중간 굵기가 없는 환경에서 얇게 그려지던 문제). 기기 서체용 자간은 지웠다.
  - 인증 모듈 필수 환경변수 테스트의 첫 불러오기를 테스트 시간 밖으로 옮겼다.
  - 이메일 로그인 실패 안내 위치: 이전 미확인(서버에 닿지 못한 실패는 알림 없이 사라짐), 이후 폼 안 버튼 아래에 실패 코드별 안내 줄
  - 이메일 로그인 폼을 펴는 줄의 이름: 이전 이메일 계정으로 로그인, 이후 기존 이메일 계정으로 로그인
  - 게스트의 계정 전환 확인 창: 이전 항상 띄움, 이후 누적 낚은 수 0으로 확인된 게스트는 건너뜀
  - 구글 버튼 글자 서체: 이전 기기 서체 중간 굵기, 자간 0.25px, 이후 게임 본문 서체 굵은 글씨, 자간 없음
  - 커밋: a22ac7f6, cd1d8c38, 8ac4943b, 6aef63d1, 93b8f3bf, ec85bf03, f3d3c404, 2cc9414c, 9060a3c2, fa155505, b661ef04, 27c9a74e, da81a73e

### 기타

- 밸런스 흐름 도구에 effects 명령(pnpm balance:flow effects)을 추가했다. 요리 효과를 넣었을 때 해역별 방치 수입 변화, 시드를 고정한 몬테카를로 도감 완성 시간, 분해 재료 공급을 낸다.
  효과 옵션: --bite(입질 대기 단축 %), --rare(희귀 이상 가중 %), --variant(돌연변이 가중치 %, 유물과 같은 경로), --size(크기 %), --move(이동 속도 %), --named(네임드 조우 가중치 %, 의뢰 구역과 출현 해역에서만), --units(재료 등급 단위, 기본 1,5,25,125), --axis(idle 또는 manual), --margin.
  측정값(dev 기준, 방치, 진입 레벨, 시드 20261110, 300회): 입질 -10%는 골드와 명성 +2.7%(세인트헬레나)\~+6.8%(마을 연못). 희귀 이상 +10%는 골드 +2.5%\~+8.8%(후반일수록 큼), 명성 +1.1%\~+2.2%. 돌연변이 가중치 +100%는 골드 전 해역 +12.0%, 명성 0, 돌연변이 도감 시간 마을 연못 8.2h에서 4.9h, 세인트헬레나 101h에서 61h, 일반 폼 도감 시간은 늘어남(마을 연못 2.4h에서 3.1h). 이동 +10%는 수입 0%, 판매 왕복 포함 +0.0\~0.1%. 네임드 조우 +50%는 태평양 1.80시간에서 1.36시간. 방치 1시간 재료 점수 545(마을 연못)\~1,250(그레이트 배리어 리프), 1000G당 점수 161.5(마을 연못)\~1.2(세인트헬레나).
  첫 구현(e1307aa)은 돌연변이를 확률 배수로 계산해 제품 규칙과 달랐고(+100%에서 골드 +20%로 과대), 네임드 조우를 조우가 없는 해역에도 냈다. f3d9074에서 제품 규칙 경로로 바로잡았다.
  - balance:flow 명령: 이전 transition, days, opening, exception, ev, gates, dist, travel, 이후 여기에 effects 추가(명령 생략 시 기본 실행에서 제외)
  - 커밋: e1307aa, f3d9074
- 밸런스 흐름 도구 effects 명령에 등급 누적 가중 옵션을 더했다. --epic N은 영웅과 전설 가중 +N%, --legendary N은 전설 가중 +N%이고 --rare와 등급마다 합산해 제품 규칙 addGradeEffect로 적용한다. 효과를 받는 등급의 캐치 비율과 영웅, 전설 도감 완성 시간(시드 고정) 열을 더했다. 기존 열의 난수 소비는 바뀌지 않는다.
  측정(방치, 진입 레벨, 시드 20261110, 300회): 희귀 이상 +40%는 골드 +11\~34%, 영웅 이상 +100%는 골드 +19\~55%와 영웅 도감 약 절반, 전설 +200%는 골드 +18\~71%와 전설 도감 약 3분의 1. 수동 기준 영웅 이상 +50%는 골드 +21\~31%, 전설 +100%는 +15\~42%(남대서양이 가장 작음, 기본 전설 비율이 낮아서).
  - effects 등급 가중 옵션: 이전 --rare(희귀 이상)만, 이후 --rare, --epic(영웅 이상), --legendary(전설), 등급별 합산
  - 커밋: 19a8ef4b, f6396e98
- 코드 주석에서 저장소 밖 맥락(사용자 결정과 날짜, 관리 문서 이름, 이슈 키)과 낡은 서버 판정 설명을 지우고 사실만 남겼다(src, api, tools 약 50곳). 포획 판정과 쿠폰 사용 판정 주석을 지금 구조(서버 리듀서, 오프라인은 클라이언트의 같은 리듀서)에 맞게 고쳤다.
  개발 명령 판정 테스트를 보강했다: DEPLOY_ENV의 빈 값, 대소문자 변형, 앞뒤 공백 거부와 동치, 강제 조우의 Origin 검증을 허용 목록 전체로 돌리고 응답 성공을 확인. 판정 코드는 바꾸지 않았다.
  .env.example 설명을 고쳤다: 서버는 Express, Sentry 환경은 SENTRY_ENV 다음 DEPLOY_ENV 다음 development, 소유자 메일은 이사 코드, 개발 명령, 강제 조우의 스테이징 소유자 판정에 쓰인다.
  보류: supabase 폴더 이름 변경(마이그레이션 경로, 테스트 설정, db-import 영향), 0033 마이그레이션 주석(적용됐을 수 있어 수정 금지).
  - 개발 명령 판정 테스트 범위: 이전 대표 값만, 이후 빈 값, 대소문자, 공백, Origin 목록 전체와 응답 성공
  - 커밋: db67324c, 60448d1f, ae8420c4, a51b1e55, 9ec45901
- 밸런스 흐름 도구에 요리 지표를 더했다. window(등급 미끼 하나의 30분 수동 창: 등급별 기대 캐치, 골드 증가, 같은 시드 짝 비교로 잰 도감 단축), recipes(레시피 순손익과 자동 기운이 열린 해역의 가방 한도 기운 공급), transition/days/gates의 도시락과 의뢰 관측 옵션, effects --margin 음수(조기 진입 비교), --axis perfect를 추가했다. 도시락 효과는 방치 캐치에만, 미끼는 수동 30분 창에만 걸고 계획 명령은 미끼를 거부한다. 기준 값과 gates 종료 코드는 요리 없이 잰다.
  측정(시드 20261110): 자동 기운은 해금 해역(인도양부터) 9시간에 일반 2,808\~3,970개, 희귀 이상 0개라 자동 기운만으로는 재촉 도시락만 하루 14\~20개 만든다. 상위 기운은 직접 기운 얻기나 앞 지역 낚시로 얻는다. 모둠 도시락은 전환마다 0.1\~1.7시간을 줄인다(용승대에서 세인트헬레나 15.87시간에서 14.12시간). 인도양 30분 창에서 영웅 미끼는 영웅 캐치 23.85에서 32.32, 전설 미끼는 전설 캐치 4.77에서 7.57.
  첫 구현은 미끼를 방치 하루에 걸 수 있었고 자동 기운 해금 전 해역까지 공급을 냈다. 82f56c0c에서 바로잡았다.
  - balance:flow 명령: 이전 effects까지, 이후 window, recipes 추가, transition/days/gates 관측 옵션
  - 커밋: 85d67274, 33dc00b3, 3cfd7e1c, ef11ffdf, 0b0d0f63, 82f56c0c
- 콜롬보항 거점에서 향료전 가구(shop, 미끼 상점)와 shop 스프라이트를 지웠다. 시설 창의 상점 패널(ShopPanel), 미끼 효과 문장(baitEffects), 거점 메뉴의 shop 카드를 지웠다. 미끼 구매 액션(buyBait)과 활성 미끼 액션(setActiveBait)은 액션 스키마에서 빠져 서버가 거부한다. 콜롬보항의 region을 거점 지역 표(BASE_REGION.colombo)에서 읽게 했다.
  - 콜롬보항 시설: 이전 향료전(미끼 상점) 있음, 이후 향료전 없음
  - 커밋: aaba19ae, d6635abf, 1743b311
- 세이브 v8에서 v9로 가는 이관 링크가 이전 미끼 4종의 보유 개수를 정가(LEGACY_BAIT_REFUND)로 골드에 더하고, 그 아이템 행과 activeBait를 지운다. 환불한 것이 있으면 영수증 baitRefund { gold, items }를 남기고 없으면 null이다. 이관은 버전을 올리는 링크라 한 번만 일어난다.
  서버는 저장 blob의 버전을 따라 이관한다(blobInput). 버전이 없는 구 행만 8로 가정한다. 풀 상태 조립, 스칼라 상태, 빠른 캐치 경로와 클라이언트 httpGameGateway가 같은 규칙을 쓴다.
  화면: 영수증이 있으면 미끼 환불 안내 창(BaitRefundModal)을 한 번 띄운다. 순서는 업데이트 소식, 미끼 환불 안내, 튜토리얼이다. 부엌이 열리기 전 배 단계이면 항로 조건 줄을 덧붙인다. 닫으면 dismissBaitRefund 액션이 영수증을 null로 만든다. 게스트도 이 액션은 허용한다.
  - 이전 미끼 환불 정가(1개당): 이전 없음, 이후 일반 25G, 희귀 200G, 영웅 1000G, 전설 2500G
  - 환불 기록: 이전 없음, 이후 세이브 baitRefund 영수증(안내 창을 닫으면 null)
  - 영향: 이전 미끼를 가진 플레이어의 골드가 첫 로드 때 정가만큼 늘고 미끼 보유분은 사라진다. 이관은 세이브에 쓰이므로 코드를 되돌려도 미끼가 복원되지 않는다. 영수증은 안내 창을 닫으면 지워지므로, 복원이 필요하면 닫기 전 세이브의 baitRefund.items나 운영 DB 백업을 근거로 보정한다.
  - 커밋: aaba19ae, d6635abf, f55ae090, 77d7dc36
- 이메일 가입과 게스트의 이메일 승격 경로를 지웠다. 게임 인증의 이메일과 비밀번호는 가입을 닫고(disableSignUp) 로그인만 남긴다. 게스트 승격 엔드포인트(api/_auth/upgrade.ts의 anonymousUpgrade)를 삭제했고, 인증 계약(platform/api/types)과 어댑터(httpApi, localApi), accountActions에서 가입을 뺐다. 계정 관리 창의 가입과 승격 흐름도 지웠다.
  기존 이메일 계정은 계정 관리 창의 접는 폼(기존 이메일 계정으로 로그인)으로 로그인하고, 구글을 연결하면 비밀번호 수단이 지워져 그 뒤로는 구글로만 로그인한다(0.19.0-33).
  - 이메일 가입: 이전 가능(게스트가 이메일과 비밀번호로 승격), 이후 불가. 승격 엔드포인트 삭제, 이메일은 기존 계정 로그인만
  - 커밋: 38e58969, c662c586, 6823479e, a5e30714
- 게스트 계정 정리에 미접속 규칙을 더했다. 진행과 관계없이 마지막 접속이 365일보다 이른 게스트 계정을 지운다. 진행이 없는 게스트를 7일 뒤 지우는 기존 규칙은 그대로다. 구글이나 이메일로 연결된 계정은 익명 표시가 풀려 대상이 아니다. 판정, 크론 응답, 운영 주의는 0.19.0-46 항목에 적는다.
  마지막 접속은 저장 갱신(구 saves 행의 저장 시각 포함), 세션 사용, 가입 가운데 가장 늦은 시각이다. 정확히 365일 전은 지우지 않는다. 제재된 계정, 관리자 계정, 개발자에게 편지를 보낸 계정은 지우지 않는다. 지우는 범위는 본인 탈퇴와 같다(deleteAccountRows).
  public 문장에는 기간을 쓰지 않았다. 기간은 개인정보 처리방침이 정한다.
  - 진행이 있는 게스트 계정의 자동 삭제: 이전 없음(진행이 없는 게스트만 마지막 활동 7일 뒤 삭제), 이후 마지막 접속이 365일보다 이르면 진행과 관계없이 삭제(제재, 관리자, 편지를 보낸 계정 제외)
  - 영향: 1년 넘게 접속하지 않은 게스트의 계정과 진행이 사라지고 복구할 수 없다. 운영 반영 시점과 대상 수 확인은 0.19.0-46 항목을 따른다.
  - 커밋: 8000bfc7, b876273e
- 마이그레이션 0034(0034_catch_quality_slots)가 뷰 v_catch_quality를 다시 정의한다. with_bait 열이 payload에 bait 또는 lunch 키가 있는 캐치를 센다. 열 이름과 집합은 그대로인 가산 변경이라 마이그레이션 먼저, 코드 배포 나중이 안전하다. down은 with_bait를 0010 정의로 되돌린다.
  관리자 읽기 함수 catchQuality(api/_data/admin)도 같은 기준으로 센다. 서버는 캐치 이벤트에 걸린 슬롯의 요리 id를 bait(미끼 슬롯), lunch(도시락 슬롯) 키로 남긴다.
  운영 적용 필요: 운영 DB(pixel-fishing-prod CNPG)에 0034 적용은 사용자 승인 뒤 릴리즈 절차에서 한다.
  - v_catch_quality.with_bait 집계 기준: 이전 payload에 bait 키가 있는 캐치(이전 활성 미끼 캐치), 이후 payload에 bait 또는 lunch 키가 있는 캐치(요리 슬롯이 걸린 캐치)
  - 영향: 집계 열의 의미가 이전 미끼 사용에서 요리 슬롯 적용으로 바뀐다. 0034 이전 날짜의 값은 이전 미끼 캐치를 센 값이다. 되돌리려면 0034_catch_quality_slots.down.sql을 적용한다.
  - 커밋: aaba19ae, c37dd8ae, 242a80e6
- 관리자 이벤트 이름표(EVENT_LABELS)에 extractEnergy(기운 얻기), cook(조리 시작), eat(먹기와 쓰기)을 더했다. 요약(eventSummary): extractEnergy는 마리 수와 기운 합, cook은 레시피 id, 수량, 추가 완성 수, eat은 요리 id와 교체한 요리 id. 캐치 요약에 도시락 슬롯(lunch)을 더했다.
  운영 탭의 이벤트를 남기지 않는 액션 안내를 현재 액션 기준으로 정리했다. 경제 일계(economy)의 buyBait 비용과 미끼 구매, 미끼 활성화 이름표는 액션이 없어진 뒤 과거 이력만 센다.
  - 커밋: aaba19ae, 595c3d65, f55ae090
- 밸런스 흐름 도구의 요리 지표를 게임 콘텐츠와 슬롯 규칙에 맞췄다.
  - 레시피와 등급 미끼 효과를 요리 콘텐츠(RECIPES)에서 불러오고 도구 안 복제 표를 지웠다. --recipe 도움말의 id 목록도 RECIPES에서 만든다.
  - 기운 공급 전제를 가방 초과 자동 기운에서 집 기운 얻기 공급으로 바꿨다. 해역 기본 선택은 규칙 모듈 energyDefaultExcluded(갈 수 있는 해역 중 가장 앞선 해역 하나 제외. 처음에는 두 해역이었고 778ec54d에서 규칙과 함께 도구의 설명과 보고서 문구를 맞췄다)를 호출한다. 관련 표의 제목, 열, 가정 문장을 바꿨다.
  - 요리 효과 계산이 게임의 slotEffects를 거치게 했다(effectOfRecipe). 효과 시작 배 단계 기본값은 COOKING_UNLOCK_BOAT이고 도구의 DEFAULT_FROM_BOAT를 지웠다.
  - 내보내는 순서를 어종과 폼 단위로 게임 개체 비교 함수와 같은 판매가 기준으로 바꿨다(0.19.0-16).
  - balance-report에서 골드 미끼 손익 표를 지웠다.
  이 변경 뒤의 측정값은 이 항목에 적지 않았다(미확인).
  - 측정 도구 기운 공급 전제: 이전 가방 초과 자동 기운(해금 해역부터), 이후 집 기운 얻기 공급(가장 앞선 해역 하나 기본 제외)
  - 레시피 표 출처: 이전 도구 안 복제 표, 이후 게임 콘텐츠 RECIPES
  - 커밋: 7eb2a451, b6047ea9, 9187119d, fe26cca1, 9ea282e3, 778ec54d
- 이전 미끼 경로를 지웠다. 콘텐츠 baits.ts, 상수 BAIT_WEIGHT_BONUS, BAIT_WEIGHT_MULT, BAIT_BUY_MAX, 미끼 구매 전용 거부 사유, 함수 usableBait, baitDiscount, baitCost, 리듀서 buyBait, setActiveBait와 캐치의 미끼 가중과 소모, 스키마의 두 액션, selectBaitInventory, 스탯의 활성 미끼 보너스 줄, HUD 활성 미끼 칩을 지웠다. prepareCatchDraw는 state 인자와 bait 결과 없이 동작하고, 캐치 이벤트의 미끼 payload와 미끼 아이템 차감을 서버에서 지웠다.
  요리 화면을 만들며 공용 요소를 더했다: Popover, 등급 괄호 표기(GradeName, gradeName, 기운과 유물 이름 뒤 괄호), 판매 창 어종 표의 공용화(FishPickTable), 메시지 글줄의 툴팁 목록. 미끼 상점 할인 테스트는 합성 유물로 바꿨다.
  - 커밋: aaba19ae, d6635abf, f55ae090, 1743b311, 06d9fae3, 98e411f1, f9bd1203, fe9a441f, 155205db, a80b1f0a
- Argo CD를 앱별 AppProject로 제한하는 클러스터 쪽 변경에 맞춰, 제품 저장소의 Application 선언 두 개(운영, 스테이징)의 spec.project를 pixel-fishing으로 바꿨다. 라이브 Application의 값이 먼저 바뀌었고, 선언을 맞추지 않으면 그 파일을 다시 적용할 때 값이 default로 되돌아간다.
  AppProject pixel-fishing의 허용 범위: 원천은 이 제품 저장소, 대상은 pixel-fishing-prod와 pixel-fishing-stage 네임스페이스, 클러스터 범위 자원은 이름이 pixel-fishing-으로 시작하는 Namespace만. 프리뷰 환경은 Argo CD Application이 아니라 해당 없다.
  - 운영 Application(pixel-fishing-prod)의 spec.project: 이전 default, 이후 pixel-fishing
  - 스테이징 Application(pixel-fishing-stage)의 spec.project: 이전 default, 이후 pixel-fishing
  - 영향: 허용 범위 밖 자원을 매니페스트에 더하면 Argo CD 동기화가 거부된다. 되돌리려면 두 선언의 값을 default로 되돌리고 라이브 Application의 값도 default로 되돌린다.
  - 커밋: c718250d
- 클러스터의 네임스페이스 Pod Security 제한 적용안에 맞춰, 제품 저장소의 Namespace 선언(k8s/prod)에 Pod Security 라벨 여섯 개를 더했다. 스테이징은 같은 선언을 이름만 바꿔 쓰므로 같은 라벨이 붙는다(로컬 kustomize 렌더로 확인). 스테이징에는 통합 브랜치 병합 직후, 운영에는 릴리즈 때 Argo CD가 적용한다. 프리뷰 네임스페이스는 대상이 아니다.
  서버 dry-run 확인 결과: 운영(파드 10개)과 스테이징(파드 3개)의 현재 파드는 baseline을 통과한다. restricted는 securityContext 네 항목(allowPrivilegeEscalation, capabilities, runAsNonRoot, seccompProfile)이 설정돼 있지 않아 위반한다.
  매니페스트의 워크로드 선언에는 baseline에 어긋나는 키(hostNetwork, hostPID, hostPath, privileged, hostPort 등)가 없다. CNPG 오퍼레이터가 만드는 파드의 실제 spec은 선언만으로 확인하지 못했다(미확인).
  - Namespace 라벨 pod-security.kubernetes.io/enforce: 이전 없음, 이후 baseline (enforce-version v1.36)
  - Namespace 라벨 pod-security.kubernetes.io/audit: 이전 없음, 이후 restricted (audit-version v1.36)
  - Namespace 라벨 pod-security.kubernetes.io/warn: 이전 없음, 이후 restricted (warn-version v1.36)
  - 영향: baseline에 어긋나는 파드는 다시 뜰 때 생성이 거부된다. 이미 떠 있는 파드에는 영향이 없다. 되돌리려면 Namespace 선언에서 라벨을 지운 커밋을 통합 브랜치에 병합한다(운영은 릴리즈 브랜치 반영). enforce를 restricted로 올리려면 파드의 securityContext 네 항목을 먼저 갖춰야 한다.
  - 커밋: 3e6541ad
- 구글 OAuth 클라이언트 값을 환경변수 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET으로 받는다(api/_auth/session.ts의 googleConfig). 기본값은 없다. 게임 인증(appAuth)과 관리자 인증(adminAuth) 모두 필수 설정 검사에 구글 클라이언트를 더해, 없으면 ApiError 500 server-config를 던진다.
  운영 배포 선언(k8s/prod/deployment.yaml)의 Secret 환경변수 주석에 두 이름을 더했다. 값은 Secret에서 주입하며 저장소에 두지 않는다.
  구글 클라우드 콘솔의 OAuth 클라이언트에는 환경마다 게임 인증 콜백과 관리자 인증 콜백(/api/admin/auth/callback/google)을 승인된 리디렉션 주소로 등록해야 한다. 게임 인증 콜백의 정확한 경로와 환경별 등록 상태는 이 항목을 쓰며 확인하지 않았다(미확인).
  - 서버 필수 환경변수: 이전 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 없음, 이후 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 추가(게임 인증과 관리자 인증 모두 필수, 기본값 없음)
  - 영향: 두 값이 없는 환경에 이 코드를 배포하면 게임 인증 요청과 관리자 로그인이 500으로 실패한다. 릴리즈 전에 운영 Secret에 두 값을 등록하고 구글 클라우드 콘솔에 운영 주소의 리디렉션 주소를 등록한다. 되돌리려면 이전 이미지로 되돌린다(이전 코드는 두 값을 읽지 않는다). 단 코드만 되돌리는 롤백은 저장 형식 버전 때문에 0.19.0-35 항목의 제약을 따른다.
  - 커밋: 38e58969, 7b749cea
- 생명의 기운 수량을 소수 첫째 자리까지 다루도록 저장과 계산 단위를 바꿨다. 화면 단위 1은 저장 단위 10이다(ENERGY_UNIT). 저장, 판정, 차감, 이벤트 payload는 저장 단위 정수로 하고 화면에서만 공용 포맷(formatEnergy)으로 나눠 보인다. 소수 첫째 자리가 0이면 정수로 쓴다. 지금의 레시피 비용과 개체당 산출은 모두 정수라 플레이어에게 보이는 값은 바뀌지 않는다.
  단위 변환과 포맷, 레시피 비용의 저장 단위 변환(recipeCostStored), 개체 하나의 산출(ENERGY_PER_INDIVIDUAL, energyYield)은 콘텐츠와 규칙 계층 한 곳에 정의한다. 기운 얻기 결과와 extractEnergy 이벤트 payload의 energy, 조리 비용 판정과 차감이 저장 단위다.
  세이브 v10: 9에서 10으로 가는 이관 링크가 기운 아이템 키(energy-common, energy-rare, energy-epic, energy-legendary)의 정수 수량에만 10을 곱한다. 다른 키와 깨진 값은 건드리지 않는다. 버전을 올리는 링크라 한 번만 일어난다(서버 DB 테스트와 게이트웨이 테스트로 고정). 기운 키의 수량 상한은 같은 화면 단위 상한이 유지되게 저장 단위 기준으로 넓혔다.
  관리자 이벤트 요약(eventSummary)은 extractEnergy의 기운 합을 formatEnergy로 보인다. 이 변경 전에 남은 이벤트의 payload는 화면 단위 개수라 10분의 1로 보인다. 요리는 마지막 릴리즈(v0.18.3)에 없으므로 해당 이벤트와 버전 9 저장은 운영에 없다.
  밸런스 흐름 도구: 기운 비용 덮어쓰기 옵션이 화면 단위 소수 첫째 자리까지의 수량을 받고 그 밖의 값은 거부한다. 재료 손실과 모으는 시간은 레시피의 기운 요구를 개체당 기운으로 나눈 개체 수로 계산한다.
  구버전 코드가 버전 10 저장을 읽을 때의 동작은 이 항목을 쓰며 확인하지 않았다(미확인).
  - 세이브 버전: 이전 v9, 이후 v10(기운 아이템 수량이 10분의 1 단위 정수)
  - 기운 아이템 수량의 저장 값: 이전 화면에 보이는 개수와 같은 정수, 이후 화면 단위의 10배 정수(화면 1은 저장 10)
  - 기운 아이템 수량 상한(저장 값): 이전 1,000,000, 이후 10,000,000(화면 단위로는 1,000,000 그대로)
  - extractEnergy 이벤트 payload의 energy: 이전 등급별 기운 개수, 이후 등급별 기운의 저장 단위 값(개수의 10배)
  - 밸런스 도구의 기운 비용 덮어쓰기 입력: 이전 정수, 이후 화면 단위 소수 첫째 자리까지
  - 영향: 배포 뒤 불러온 저장은 버전 10으로 쓰인다. 코드만 이전 버전으로 되돌리는 롤백은 하지 않는다. 구버전 코드는 버전 10 저장과 10배로 저장된 기운 수량을 알지 못한다. 되돌려야 하면 배포 전 DB 백업으로 데이터를 먼저 복구한다. 미끼 환불 이관(0.19.0-18)과 같은 릴리즈에 실리므로 릴리즈 전 운영 DB 백업이 두 이관의 복구 근거다.
  - 커밋: f1164e53, d55308d0, 8d8bd69b, 416b3e99, ec21ff68, 077da0a3, 76651327, 41ee8755, f30391d4, d35f3420
- 밸런스 흐름 도구의 recipes, window 명령에 측정 입력 옵션을 더했다. 옵션이 없으면 출력은 이전과 같다.
  - --cost(recipes, window): 레시피 기운 수량 덮어쓰기(parseCostSpec, withCostOverrides). 콘텐츠 값은 바꾸지 않고 측정 입력만 바꾼다. 등급 중복은 거부한다.
  - --manual-share, --visit-hours, --rod-offset(recipes): 집 기운 얻기 공급에 수동 낚시 비율과 집에 들르는 간격을 더했다. 간격마다 가방을 비워 구간별 결과를 합산한다.
  보정(6b116927): 구간별 낚은 수를 누적 기대값을 한 번 반올림한 값의 차이로 정해 구간이 많아도 오차가 쌓이지 않게 했다. 방문 간격 하한(MIN_VISIT_HOURS 0.25시간)을 뒀다. window의 재료 비용 표를 recipes와 같은 계산(레시피 효과와 슬롯 지속, 재료 모으기는 --axis를 줬으면 그 방식이고 아니면 방치)으로 만들고 방식과 지속을 출력에 밝힌다.
  --cost가 받는 수량은 이 묶음에서는 0 이상 정수였고, 화면 단위 소수 첫째 자리까지 받게 한 것은 0.19.0-35 항목이다.
  - balance:flow recipes, window의 옵션: 이전 기운 수량과 공급 방식은 콘텐츠와 기본 전제 고정, 이후 --cost(recipes, window), --manual-share, --visit-hours, --rod-offset(recipes) 추가
  - 커밋: 4bb1fcb1, 6b116927
- 스프라이트의 격자와 표시 배율을 대상별 정의 한 곳(SPRITE_TARGETS)에 모으고, 스프라이트 도구가 그 정의를 읽게 일반화했다. 화면에 보이는 그림은 바뀌지 않는다.
  - 정의: 대상 종류별 격자, 안전 여백, 표시 프리셋, 팔레트 방식, 상태 행, 움직임, id 라벨. 물고기, 배, 장비는 기존 값을 그대로 옮겼고 요리, 미끼, 유물은 격자 미정으로 등록했다(요리와 미끼의 격자는 0.19.0-43). 대상 종류 목록(SpriteKind, SPRITE_KINDS)은 정의의 키에서 유도한다. 외곽선 색과 실루엣 색을 물고기 모듈 밖 공통 모듈로 옮겼다. FishSprite, BoatSprite, GearSprite가 프리셋을 정의에서 읽는다.
  - 도구: 원화 가져오기(import-png)가 대상 종류를 받아 대상별 원화 폴더와 생성 파일을 쓰고 원화 크기를 정의의 격자로 검증한다. 격자 미정 대상과 공용 팔레트 대상, variant 상태가 없는 대상의 variant 원화는 거부한다. 시안 시트(render-sheet), 검수 시트(review-sheet), 화풍 검사(style-check)가 대상 종류와 id를 인자로 받고 내장 후보 목록을 지웠다. 배, 장비, 어종 형태, 남대서양 초안 생성기가 격자와 여백을 정의에서 읽는다.
  - 공통 규칙 검사(checkRows): 대각선으로만 닿는 셀, 부유 픽셀, 대상별 안전 여백을 코드에 있는 모든 대상의 격자에 돌리고 격자 크기가 정의와 같은지 본다. 기존 격자의 위반은 위치와 이유를 적은 예외 목록으로 두고, 목록 항목이 더는 위반이 아니면 실패한다.
  - 스프라이트 에디터: 대상 종류를 고르면 기본 격자 크기, 안전 여백 표시, 프리셋 배율, 상태별 미리보기, 내보내기 방식이 정의대로 바뀐다. 정의를 에디터용 스크립트로 내보내는 생성기와 정의 일치 테스트를 더했다.
  - 도구 주석과 테스트 이름에서 파일 경로와 외부 문서 참조를 지웠다.
  - 커밋: 0bb96460, 8cdbaae6, 28d2eb81, 0480e8a5, 176de0e3, 5b40045c, b771a102, 62fdafbc, 31ed44b4
- 전역 스타일(src/index.css)의 외부 글꼴 스타일시트 import를 지우고, 표현 계층 UI 폴더(src/presentation/ui/fonts)의 @font-face 선언(fonts.css)을 import한다. 방문자 IP가 로그인과 관계없이 Google로 나가는 것을 없애려는 변경이다.
  - 본문 글꼴 Noto Sans KR: woff2 124개(한글 문자 범위 조각 120개, latin, latin-ext, cyrillic, vietnamese), 선언의 굵기 범위 400 700(파일은 wght 100\~900 축), font-display swap. 한글은 unicode-range 조각이라 화면에 쓰인 글자의 조각만 받는다. 파일 합계 약 3.7MB.
  - 픽셀 글꼴 Silkscreen: 400과 700의 latin, latin-ext woff2 4개, font-display swap.
  - 두 글꼴 폴더에 SIL OFL 1.1 전문(OFL.txt)을 둔다.
  - 링크 미리보기 원본(tools/og-image/og.html)은 외부 스타일시트 대신 저장소의 Silkscreen 700 latin 파일을 상대 경로 @font-face(font-display block)로 읽는다. 다시 만드는 명령은 file:/// 주소로 열고 네트워크가 필요 없다.
  - 가드 테스트(fontHosting.test.ts): index.html, Dockerfile, src의 CSS, tools의 HTML, 관리자 화면 파일, k8s, 서버 헤더 설정에 fonts.googleapis.com, fonts.gstatic.com이 없는지, 외부 @import와 index.html의 preconnect가 없는지, 두 패밀리와 굵기와 swap 선언, 선언이 가리키는 woff2 목록과 폴더의 woff2 목록이 정확히 같은지, OFL 전문이 있는지 본다.
  처음 커밋(753a9b0d)은 폰트를 src/assets/fonts에 두었고 86e2380f에서 표현 계층 UI 폴더로 옮겼다.
  - 본문과 픽셀 글꼴의 출처: 이전 외부 글꼴 서비스(fonts.googleapis.com 스타일시트, fonts.gstatic.com 파일), 이후 게임과 같은 출처(저장소의 woff2와 @font-face 선언)
  - 링크 미리보기 원본의 글꼴: 이전 fonts.googleapis.com 스타일시트(display block), 다시 만들 때 네트워크 필요, 이후 저장소의 Silkscreen 700 latin woff2(상대 경로), 네트워크 불필요
  - 외부 글꼴 도메인 가드: 이전 없음, 이후 fontHosting.test.ts(외부 도메인, 외부 @import, preconnect, 선언과 파일 목록 일치, OFL 전문)
  - 영향: 방문자 브라우저에서 Google 글꼴 도메인으로 가는 요청이 없어진다. 개인정보 처리방침 초안의 행태정보 문장(게임이 외부 글꼴을 불러오지 않는다)은 이 변경이 반영된 환경에서 사실이 된다. 되돌리려면 src/index.css의 import를 외부 스타일시트로 되돌린다.
  - 커밋: 753a9b0d, d749989a, 86e2380f
- 정리 기준을 계정 모듈(api/_data/account.ts) 한 곳에 모았다. IDLE_DAYS 7, STALE_DAYS 365이고 purgeCutoffs(now)가 두 컷오프를 만든다. selectPurgeTargets와 purgeAccount는 컷오프 대신 now를 받는다. 크론(api/cron/purge-anon.ts)은 컷오프를 직접 만들지 않고 선정 결과의 기준 시각을 요약에 싣는다.
  대상 조건(targetFrom): 익명 계정 가운데 rule.by_stale 또는 rule.by_idle이고, 제재가 아니며, 관리자 명부에 없고, 편지가 없는 계정이다.
  - 마지막 접속(seen.at)은 lateral로 한 번 계산한다. greatest(saves_current.updated_at, 세션 갱신 시각 최댓값, 구 saves 행 갱신 시각 최댓값, 가입 시각)이다. 가입 시각은 비지 않으므로 항상 정해진다.
  - by_stale: seen.at < 365일 전. 진행과 구 saves 행 여부를 보지 않는다.
  - by_idle: seen.at < 7일 전이고 저장 상태가 비었거나(골드와 명성 0) 저장 상태와 구 saves 행이 모두 없다(기존 조건).
  - 선정 결과에 total, stale(by_stale 수, 창 함수 집계), cutoffs, ids(마지막 접속이 오래된 순, 상한 500)를 싣는다. 삭제 직전 재확인(purgeAccount)도 같은 조건을 쓴다.
  크론 요약: cutoff(7일 규칙 기준 시각)에 staleCutoff, staleTargets를 더했다. dry-run(PURGE_ANON_ENABLED가 정확히 1이 아님)이면 대상만 센다.
  DB 테스트: 365일 경계, 접속 근거별 최근성(저장, 구 saves, 세션, 가입), 연결 계정과 제재, 관리자, 편지 제외, 길드 승계, 재실행, 크론의 1년 규칙 dry-run과 삭제.
  운영 Secret의 PURGE_ANON_ENABLED가 켜져 있고 purge-anon 크론이 매일 돈다는 것을 2026-11-13에 확인했다(값은 켜짐 여부만 확인).
  - 정리 대상 규칙: 이전 진행이 없는 게스트, 마지막 활동 7일 전보다 이름(구 saves 행이 있으면 제외), 이후 그 규칙에 더해, 진행과 구 saves 행 여부와 관계없이 마지막 접속 365일 전보다 이른 게스트
  - 마지막 접속 계산: 이전 greatest(저장 상태 갱신, 세션 갱신 최댓값, 가입), 이후 greatest(저장 상태 갱신, 세션 갱신 최댓값, 구 saves 행 갱신 최댓값, 가입). 7일 규칙에도 같이 적용
  - 크론 응답 요약 필드: 이전 dryRun, cutoff, targets, batch, deleted, skipped, failed, sample, chat, 이후 여기에 staleCutoff, staleTargets 추가
  - 정리 기준 일수의 위치: 이전 크론의 IDLE_DAYS 7, 이후 계정 모듈의 IDLE_DAYS 7, STALE_DAYS 365(purgeCutoffs)
  - 영향: 운영에 반영되면 다음 크론 실행(매일 18:30 UTC)부터 1년 넘게 접속하지 않은 게스트가 진행과 함께 지워지고, 한 번에 최대 500계정을 다루며 나머지는 다음 실행이 잇는다. 지운 계정은 되돌릴 수 없고 DB 백업에서만 복구할 수 있다. 배포 전에 PURGE_ANON_ENABLED를 끈 실행이나 같은 조건의 읽기 조회로 staleTargets를 확인한다. 되돌리려면 이전 이미지로 되돌린다(7일 규칙만 남고 응답의 두 필드가 빠진다).
  - 커밋: 8000bfc7, b876273e
- 마이그레이션 0035(0035_drop_supabase_users)가 drop table if exists auth.supabase_users를 실행한다. cascade는 쓰지 않아 뜻하지 않은 참조가 있으면 객체를 지우지 않고 실패한다. 0021이 공개 표의 외래 키와 관리자 사용자 명부 뷰를 현재 인증 표(auth.users)로 옮겼으므로 코드상 참조하는 객체는 없다. 표를 지우려면 마이그레이션을 실행하는 역할이 표의 소유자여야 한다.
  되돌리기(0035.down)는 auth.supabase_users를 0021이 남긴 열 구성(Supabase 덤프의 auth.users, 생성 열 confirmed_at 제외)의 빈 표로 다시 만든다. 이 표가 있어야 0021.down이 이어지므로, 0035 뒤에 0021.down을 쓰려면 0035.down을 먼저 적용한다.
  DB 테스트: 적용 뒤 표가 없고 현재 인증 표가 그대로인지, 표가 있던 DB에서 지워지고 재실행이 실패하지 않는지, 참조하는 객체가 있으면 실패하는지, 0035.down과 0021.down으로 내렸다가 다시 올리는 왕복.
  DB 가져오기 도구(tools/db-import): 행 수 대조에서 덤프의 auth.users를 이전 표와 현재 표 둘로 세던 분기를 지우고 덤프에 있는 표만 같은 이름으로 대조한다. 호환 SQL의 주석을 auth.users가 덤프 데이터를 받는 자리이고 0021이 읽어 옮기며, 이름을 바꿔 남긴 이전 표는 0035가 지운다는 내용으로 고쳤다.
  운영 적용 필요: 운영 DB(pixel-fishing-prod CNPG)에 0035 적용은 사용자 승인 뒤 릴리즈 절차에서 한다.
  - auth.supabase_users 표: 이전 있음(0021이 이름을 바꿔 남긴 이전 인증 계정 표, 읽는 코드 없음), 이후 없음(0035가 cascade 없이 삭제)
  - DB 가져오기 도구의 auth.users 행 수 대조: 이전 auth.supabase_users와 auth.users 둘 다 덤프 행 수와 비교, 이후 덤프에 있는 표만 같은 이름으로 비교
  - 영향: 이전 인증 데이터가 운영 DB에서 사라지고, 인증 이전(0021)을 데이터와 함께 되돌릴 수단이 없어진다. 데이터가 필요하면 롤백보다 먼저 DB 백업에서 복구한다. 0035.down은 빈 표만 만든다.
  - 커밋: 6a06d61e, 4f610330, 247a86a7

## [0.18.5] - 2026-11-11

### UI

- 거점 시설 카드 메뉴가 PC 레이아웃의 쌓기 단계에서 스테이지 세로 가운데에 놓여 화면 크기마다 위치가 달랐다.
  메뉴 영역 클래스(stackTier의 STACK_MENU_CLASS)를 PC 레이아웃 전 구간에서 헤더 아래 여백(pc:top-16)에 붙이고, BaseMenu의 카드 묶음 세로 가운데 정렬(my-auto)을 제거했다.
  - 거점 시설 카드 메뉴의 세로 위치(PC 레이아웃 전 구간): 이전 쌓기 단계는 스테이지 세로 가운데(inset-y-16), 그 밖의 폭은 가운데 정렬(my-auto), 이후 헤더 아래 여백(pc:top-16)에서 위쪽부터 배치
  - 커밋: 4005930

## [0.18.4] - 2026-11-11

### UI

- PC 레이아웃에서 스테이지 폭이 464px보다 좁아지는 쌓기 단계를 새로 정의했다(stackTier에 경계와 클래스 상수를 한 곳에 둠).
  쌓기 단계에서는 오른쪽 아래 열과 메시지 창을 한 줄기로 쌓고, 거점 카드 메뉴를 fill 프레임의 overlay로 옮겨 헤더 아래에 배치한다. df5de52에서 카드 메뉴 영역을 위쪽 여백만 두던 top-16에서 위아래 같은 inset-y-16으로 바꿔 세로 가운데에 놓았다(0.18.5에서 다시 위쪽 배치로 바뀜).
  - PC 레이아웃 스테이지 폭 464px 미만의 배치: 이전 별도 단계 없음, 이후 쌓기 단계: 오른쪽 아래 열과 메시지 창을 줄기로 쌓음, 거점 카드 메뉴는 헤더 아래 overlay
  - 쌓기 단계 거점 카드 메뉴 영역: 이전 정의 없음, 이후 위아래 같은 inset-y-16 (스테이지 세로 가운데)
  - 커밋: 7f28da7, df5de52
- 쌓기 단계에서 공간이 부족해 새 도감 줄(HudRows), 가방 안내 줄(AwayCard), 흔적 문장(TraceCard)을 생략하고 툴팁으로 넘겼다.
  낚시 상태 띠의 판정 영역 설명 줄(statusText, Field)을 분리해 헤더 두 행 단계(headerTier)에서 숨긴다.
  - 쌓기 단계에서 새 도감 줄, 가방 안내 줄, 흔적 문장: 이전 항상 표시, 이후 생략하고 툴팁으로 표시
  - 헤더 두 행 단계의 낚시 상태 띠 판정 영역 설명 줄: 이전 표시, 이후 숨김
  - 커밋: 7f28da7
- 쌓기 단계의 메시지 창을 폭 전체와 기록 5줄(--log-lines)로 표시하고, 칩 줄이 열 폭을 넘으면 줄을 나누도록 HudLayout을 고쳤다. GameFrame의 fill 프레임이 쌓기 단계에서 스테이지 전체로 넓어진다.
  - 쌓기 단계의 메시지 창 크기: 이전 기존 배치, 이후 폭 전체, 기록 5줄(--log-lines)
  - 커밋: 7f28da7

### 수정

- PC에서 창이 좁을 때 메시지 창이 미니맵이나 카드와 겹쳤다. 쌓기 단계에서 오른쪽 아래 열과 메시지 창을 줄기로 쌓아 겹치지 않게 했다. 메시지 창은 아래에 두고 그 위에 다른 요소를 쌓는다.
  - 커밋: 7f28da7
- 같은 버전에서 더한 칩 줄의 flex-wrap이 모바일 레이아웃에도 걸려 줄이 나뉘었다.
  pc: 변형으로 한정해 모바일 레이아웃은 한 줄을 유지한다. 운영에 나간 적 없는 dev 회귀다.
  - 칩 줄 flex-wrap 적용 범위: 이전 모든 레이아웃, 이후 PC 레이아웃
  - 커밋: e3eb9c1

## [0.18.3] - 2026-11-11

### 수정

- 숨은 탭에서 브라우저가 타이머를 늦게 깨우면 방치 사이클의 단계 지연이 다음 단계로 누적됐다.
  단계 타이머를 이전 단계의 목표 시각 기준 절대 시각으로 예약하고(phaseStartAt, chainStartAt), 늦게 깨어난 지연은 1초(MAX_CATCH_UP_MS)까지만 다음 단계 기준에 반영한다.
  획득 카운트다운은 서버 결과가 도착한 시각부터 계산해(633fa18), 응답이 늦어도 서버 하한 거절(catchTooSoon)이 나지 않게 했다.
  - 단계 타이머 예약 방식: 이전 단계마다 상대 시간(setTimeout ms), 이후 단계 시작 기준 시각 + 단계 길이의 절대 시각
  - 늦게 깨어난 지연을 다음 단계 기준에 반영하는 양: 이전 상한 없이 누적, 이후 최대 1초(1000ms)
  - 획득 카운트다운의 기준 시각: 이전 단계 전이 시각, 이후 서버 결과 도착 시각
  - 숨은 탭 Lv30 방치 사이클 실측 길이: 이전 미확인, 이후 미확인
  - 커밋: e096932, 633fa18
- debug 명령과 강제 조우 판정이 Origin 정규식(localOrigin)을 썼다. Origin은 요청하는 쪽이 정할 수 있는 값이다.
  이사 코드 판정과 같은 판정 표(devGateVerdict)를 공유하도록 정리해, 서버 환경(DEPLOY_ENV)과 호출자 계정의 소유자 여부만 본다. production은 거부, preview는 소유자만, local은 모두 허용, 미설정과 모르는 값은 거부한다. Origin을 위조한 비소유자 테스트를 더했다.
  - 개발 명령과 강제 조우 허용 판정의 입력: 이전 DEPLOY_ENV, 소유자 여부, 요청 Origin(localhost 정규식), 이후 DEPLOY_ENV, 소유자 여부
  - 스테이징(preview)에서 로컬 Origin 요청의 허용: 이전 허용, 이후 소유자만 허용
  - 영향: 스테이징과 개발 환경에서 비소유자가 Origin을 바꿔 개발 명령을 쓰는 경로가 막힌다. 되돌리려면 754c480을 되돌리되 보안 수정이므로 권하지 않는다.
  - 커밋: 754c480

## [0.18.2] - 2026-11-11

### UI

- 모바일 레이아웃 판정 경계의 정본 --breakpoint-pc를 64rem(1024px)에서 48rem(768px, Tailwind md와 같은 값)으로 바꿨다. useMobileLayout의 MOBILE_QUERY가 (width < 48rem)을 쓴다. 경계 767/768 검증과 1024 리터럴, lg: 변형 재유입 가드를 더했다.
  - 모바일 레이아웃으로 바뀌는 창 너비 경계: 이전 1024px 미만(64rem), 이후 768px 미만(48rem)
  - 커밋: d148ddc
- PC 헤더를 흐름 배치와 스테이지 폭 세 단계로 나눴다. 단계 경계(772px, 640px)와 단계별 CSS 변수를 headerTier에 한 곳으로 정의했다. 자원 바와 메뉴 버튼을 1fr auto 1fr 헤더 행의 형제로 배치하고, ResourceBar는 한 버튼 안에 다섯 칸 본문과 두 행 본문(ResourceRows, 모바일 자원 바와 공용)을 두어 단계 변수로 하나만 표시한다.
  - PC 자원 바의 단계 경계(스테이지 폭): 이전 단계 없음, 이후 772px와 640px 경계의 세 단계, 좁은 단계는 두 행 본문
  - 커밋: ab0ff05, fb29ba4
- 효과 표기를 보너스 퍼센트와 배수로 통일했다. 미끼 효과 라벨은 {등급} 등급 가중치 +N%(N은 BAIT_WEIGHT_BONUS), 할인 태그는 미끼값 -N%, 길드 효과 이름은 일반 등급 가중치로 바꿨다. 방치 낚시 값은 N배 적용값으로 표시하고 fmtMult를 추가했다. ×N 표기 금지 가드(effectNotation.test)를 더했다.
  - 미끼 효과 라벨: 이전 미확인, 이후 {등급} 등급 가중치 +N%
  - 길드 효과 이름: 이전 미확인, 이후 일반 등급 가중치
  - 방치 낚시 값 표기: 이전 미확인, 이후 N배 적용값(요구 파워 배수, 페널티, 적용값 내역)
  - 커밋: 398df6b
- 항구 그림을 36x28 사각형 기준으로 그리고 건물 정의에 flip을 더해 좌우만 뒤집을 수 있게 했다(회전 없음). 서쪽을 바라보는 항구만 반전해 크레인이 바다 쪽에 온다. 부두 받침을 그려 그림과 부두 사이 빈칸을 없앴고, 배치 검증을 강화했다.
  - 서향 항구 그림의 방향: 이전 바다 반대쪽을 향함, 이후 좌우 반전으로 바다 쪽을 향함
  - 커밋: 9979185, 05a8e8f, 9fdd476, 4d7d8ef
- 방치 페널티 도움말의 셋째 줄(파워가 모자랄 때의 설명)을 클라이언트의 withUnderpowerLine에서 서버 규칙 쪽 autoPenaltyHelpText로 옮기고 withUnderpowerLine을 삭제했다. 사용처가 없는 autoBoostForSpot과 prepareCatchDraw의 spot 매개변수를 정리했다. 동작 변경은 없다.
  - 커밋: 5e09486

### 밸런스

- 같은 종류의 효과가 여러 개 걸릴 때 최댓값이나 곱으로 처리하던 것을 합산해 한 번 적용하도록 바꿨다.
  유물: 결투 가속 배수를 곱 대신 (1 - 감소율 합)으로 계산하고 0 아래로 내리지 않으며, 돌연변이 가중치 증가율을 최댓값 대신 합으로 계산한다. 미끼 할인율은 최댓값 대신 합으로 계산하고 1로 제한한다.
  등급 가중치: rarityDrawWeights가 등급마다 (1 + 효과 합)을 다이얼과 곱한다. 미끼는 대상 등급 +BAIT_WEIGHT_BONUS, 길드 희귀 어종 보너스는 일반 등급 -합 효과로 같은 경로에 더한다.
  - 결투 가속 배수 (유물 효과 여러 개): 이전 효과별 배수의 곱, 이후 (1 - 감소율 합), 하한 0
  - 돌연변이 가중치 증가율 (유물 여러 개): 이전 최댓값, 이후 합
  - 미끼 할인율 (유물 여러 개): 이전 최댓값, 이후 합, 상한 1
  - 일반 미끼와 길드 희귀 어종 보너스가 겹칠 때 일반 가중치: 이전 2 x (1 - 합), 이후 (1 + 1 - 합)
  - 영향: 효과를 둘 이상 겹쳐 가진 경우에만 값이 달라진다. 단일 효과의 값은 그대로다. 되돌리려면 5c7ab17, 55c9ba9를 되돌린다.
  - 커밋: 5c7ab17, 55c9ba9

### 수정

- 항구마다 기준점(경위도)과 바다 방향만 설정에 두고, 건물, 부두, 접안 자리, 출항 자리를 placeHarbor 한 함수가 같은 상수로 계산하도록 바꿨다. 손으로 적은 부두 식과 항구별 접안, 출항 앵커를 삭제했다. 부산항 출항 자리는 고향 항구 앞으로 정해지고, 투아마시나 기준점은 접안 자리와 출항 자리가 같은 구역에 들도록 해안선을 따라 남쪽으로 옮겼다.
  - 투아마시나항 기준점: 이전 미확인, 이후 접안 자리와 출항 자리가 같은 구역에 들도록 해안선을 따라 남쪽으로 이동(좌표 값 미확인)
  - 커밋: 05a8e8f
- PC 헤더에서 자원 바와 메뉴 버튼이 같은 절대 좌표 영역에 있어 창이 좁으면 겹쳤다. 둘을 헤더 행의 형제로 배치(1fr auto 1fr)해 겹침이 생기지 않게 했다.
  - 커밋: ab0ff05
- 스탯 창의 방치 낚시 배수가 autoBoost 값을 보여 실제 적용값과 달랐다. idle(요구 파워 배수, 페널티, 적용값)을 서버 규칙의 commonWeightMultiplier에서 구성해 표시값이 적용값과 같게 했다.
  - 커밋: 398df6b
- BonusTab이 모바일 레이아웃에서 출처 열을 칸 폭의 35%로 두고 표 최소 폭을 풀어 가로 스크롤을 없앴다. 효과와 출처 셀은 말줄임 대신 줄바꿈으로 표시하고 PC는 기존 배치를 유지한다.
  - 모바일 보너스 탭 표의 출처 열 폭: 이전 미확인, 이후 칸 폭의 35%
  - 커밋: 68fdcf1

### 기타

- 패치노트에 비공개 항목(visible 속성)을 두고 0.1.0부터 0.18.0까지 문안을 새 규칙으로 교체했다. 태그에 수정을 더하고 데이터 가드(태그 목록과 순서)를 추가했다.
  - 커밋: 3b1102a, 588fe97
- 밸런스 측정 도구(tools/balance)를 바꿨다. 캐치 표본 추출과 몬테카를로 분포(최초 10분, 해역 전환), 판매 왕복 이동 시간 측정, 해역별 가격 배율 덮어쓰기를 더했다. 플레이 흐름 시간을 실질 낚시 시간과 하루 8시간 환산으로 통일했고, gates 명령에 이동 직후 수입, PERFECT 이상치, 명성 비율, 최초 10분, 전환 시간 판정을 더했다.
  - 플레이 흐름의 하루 기준: 이전 플레이 유형별 가정(낚지 못하는 비율, 잠든 시간 가방 한도 등), 이후 실질 낚시 8시간 고정, 일수는 8시간 환산
  - 옵션 --loss4h, --bag-cap-awake, --travel-share: 이전 있음, 이후 제거(사용법 오류로 끝남)
  - 커밋: 12c39ba, 08849ce, 93d5aff, 5dd6acc, 0f1b3e2, 5a13c6e, 46ade86, 4564c32, 1a4e6d3, 11d39d9, 4c236f5, 78f5045, cee6aa3, 80e0392, 76cad75, ab9c9e1, 782a143
- 서버 부하 측정 도구를 더했다. load:accounts로 로그인 한도 안에서 익명 계정을 미리 만들고, load:run이 --accounts 세션으로 실시간 채널과 낚시 액션을 실제 클라이언트와 같은 형식과 간격으로 보낸다. 운영 도메인은 부하 대상에서 거부하고 감시용 probe에만 허용한다. 모든 요청은 redirect: error로 보내고, 중단한 실행은 0이 아닌 코드로 끝난다.
  - 로그인 한도 안의 계정 생성 간격: 이전 없음, 이후 계정 2개씩 만든 뒤 10.5초 대기(로그인 한도 10초 3회)
  - 커밋: dfeaf7f, 23c8e2d, b9a6fcd, dce5b4b
- layout:check 명령을 더했다. 헤드리스 Chrome으로 폭과 상태(초기, 최장 값)마다 헤더를 재서 뷰포트 안 판정, 겹침, 간격, 글자 잘림, 단계 판정을 한다. 폭 목록은 판정 경계와 헤더 단계 경계, 사이드바 폭에서 계산한다. 위반이 있으면 종료 코드 1이다.
  - 커밋: 9f8a0c1, 34783ad, 10fb0f0, 982bb76, 60bb217, e40a30e
- 스테이징 앱과 DB의 CPU 한도를 400m으로 제한했다(k8s/stage). 스테이징 앱 컨테이너의 DEPLOY_ENV를 preview로 명시했다.
  - 스테이징 앱과 DB의 CPU 한도: 이전 미확인, 이후 400m
  - 영향: 스테이징에서 부하가 몰리면 CPU가 제한되어 응답이 느려질 수 있다. 되돌리려면 k8s/stage의 한도 값을 되돌린다.
  - 커밋: b2596fd, 0dcf822, 9b6c4a5

## [0.18.1] - 2026-11-10

### UI

- 최근 소식 다시 보기가 현재 버전 항목 유무로 버튼을 숨기던 hasCurrentNews를 제거하고, 배열 순서 대신 현재 버전 이하에서 가장 높은 버전의 소식을 열도록 바꿨다(항목이 없으면 열지 않음). 소식 창의 체크 이름표를 접속할 때 이 소식 띄우지 않기로 바꾸고, 다시 보지 않기 기록을 열린 소식의 버전 기준으로 남긴다. 패치노트 데이터가 중복 없이 내림차순이고 첫 항목이 현재 버전 이하인지 확인하는 가드 테스트를 더했다.
  - 최근 소식 다시 보기 버튼: 이전 현재 버전 항목이 있을 때만 표시, 이후 항상 표시, 항목이 있는 가장 최근 버전을 연다
  - 커밋: 18bdc21, dfc14db, 0930170, d6b79bf

### 수정

- 보안 문제가 알려진 외부 구성 요소의 패치 판으로 올렸다. zod 4.6.5에서 4.6.7, jsdom ^30.0.1에서 ^30.1.3, vite ^8.2.0에서 ^8.3.6, vitest ^4.1.11에서 ^4.1.12.
  - zod: 이전 4.6.5, 이후 4.6.7
  - jsdom: 이전 ^30.0.1, 이후 ^30.1.3
  - vite: 이전 ^8.2.0, 이후 ^8.3.6
  - vitest: 이전 ^4.1.11, 이후 ^4.1.12
  - 영향: 의존성 패치 판 갱신이다. 되돌리려면 package.json과 잠금 파일의 버전을 되돌리지만 보안 수정이므로 권하지 않는다.
  - 커밋: c233bdc
- 이사 코드 불러오기(import) 허용 판정을 요청 Origin 기반에서 서버 환경 설정(DEPLOY_ENV)과 호출자 계정으로 바꿨다. importVerdict: production은 소유자도 거부(import-disabled), preview는 소유자만(import-owner-only), local은 허용, 미설정과 모르는 값은 거부한다. 소유자 이메일 설정이 빈 문자열일 때 빈 계정 이메일이 소유자로 열리던 문제도 고쳤다(importOwnerEmail이 빈 env를 폴백으로 대체, isImportOwner는 계정 이메일이 없거나 비면 소유자가 아님).
  - 불러오기 허용 판정의 입력: 이전 요청 Origin(로컬 오리진 여부), 소유자 여부, 이후 DEPLOY_ENV, 소유자 여부
  - 운영(production)에서 불러오기: 이전 소유자 계정이면 허용, 이후 소유자도 거부(import-disabled)
  - 소유자 이메일 설정이 빈 값일 때: 이전 빈 계정 이메일이 소유자로 판정될 수 있음, 이후 소유자 아님
  - 영향: 운영 서버는 이사 코드 불러오기를 받지 않는다. 스테이징은 소유자만 가능하다. 되돌리려면 41daefc, 955c4e4를 되돌리되 보안 수정이므로 권하지 않는다.
  - 커밋: 41daefc, 955c4e4

### 기타

- 패치노트에 공개 항목이 없는 버전을 출시할 수 있게 했다. 현재 버전에 항목이 없어도 접속 팝업과 다시 보기가 동작하도록 판정을 정리하고 테스트(현재 버전 패치노트 항목이 없는 릴리즈 허용)를 더했다.
  - 커밋: d6b79bf, 0930170, 18bdc21
- 운영 앱 컨테이너(k8s/prod/deployment.yaml)의 env에 DEPLOY_ENV=production을 명시하고, 스테이징 kustomize 패치에서 DEPLOY_ENV를 preview로 교체했다.
  - 운영 앱 컨테이너의 DEPLOY_ENV: 이전 미설정, 이후 production
  - 스테이징 앱 컨테이너의 DEPLOY_ENV: 이전 미설정, 이후 preview
  - 영향: 불러오기 판정이 이 값을 읽으므로 값이 비면 불러오기가 거부된다(안전한 쪽). 되돌리려면 매니페스트의 env 줄을 지운다.
  - 커밋: 3792368
- .env.example에 DEPLOY_ENV(production, preview, local) 안내를 더하고 소유자 메일 설명에 빈 계정 이메일 처리를 반영했다.
  - 영향: 안내 문서만 바뀌었다. 동작 변경은 없다.
  - 커밋: 3672e85

## [0.18.0] - 2026-11-09

### 기능

- 새 지역 southatlantic(남대서양)과 해역 benguela(남대서양 용승대), sthelena(세인트헬레나)를 추가했다. 최상위 구역에는 스팟이 없고(열린 바다는 통행 전용) 입장 배는 8단계(entryBoat 8)다. 지역 목록 끝에 더해지므로 등급 가중치 지역 단계 프리셋이 한 칸씩 밀린다. 용승대 어종 9종, 세인트헬레나 어종 8종을 더했고 교체 어종을 후속 id로 잇는 RETIRED_FISH_IDS와 도감 이관을 넣었다. 월드 지도는 항해 창을 15W까지 넓히고 적도 북쪽을 열지 않은 바다로 막았다. 세인트헬레나, 울릉도, 독도를 찍었다.
  - 남대서양 지역과 해역: 이전 없음, 이후 구역 southatlantic, 해역 용승대(benguela)와 세인트헬레나(sthelena)
  - 남대서양 입장 배: 이전 -, 이후 8단계 대양 트롤선
  - 남대서양 해역 요구 파워: 이전 -, 이후 용승대 130(낚싯대 Lv25 환산), 세인트헬레나 140(Lv27 환산)
  - 어종 수: 이전 미확인, 이후 103종(낮 79, 밤 24), 남대서양 신규 17종(용승대 9, 세인트헬레나 8)
  - 커밋: a3ca43d, 83c2019, 5cbe1cc, d040d37, 72bf05f, 2797af9, 567c3e1, 347b4c4, faae053
- 거점 walvisbay(월비스베이항)를 추가했다. 시설은 게시판, 수배판, 공방, 조선소, 어시장, 마을행 여객선, 빠른 이동 여객선, 승선이다. 수배 창구는 남대서양(southatlantic)이고, 저장 위치 위생 검사가 월비스베이항을 보존하도록 거점 목록에 넣었다.
  - 거점: 이전 없음, 이후 월비스베이항(walvisbay) 추가
  - 커밋: 71dec8a, 5cbe1cc, 63d4f13
- 네임드 아다마스토르(용승대 한정, 체력 9)와 야스코니우스(세인트헬레나 한정, 체력 9)를 추가했다. 도감 로어, 수배서, 흔적, 전승을 더했다. 수배판이 구역의 네임드마다 한 항목을 모두 내도록 offeredQuestsFor와 isQuestOffered를 추가했고, 일일 의뢰 dailyQuestFor는 일반 난이도만 받는다. 서버 수주 검증은 수배판이 낸 의뢰 전체를 허용한다.
  - 네임드 수: 이전 4마리, 이후 6마리(아다마스토르, 야스코니우스 추가)
  - 네임드 토벌 체력: 이전 -, 이후 아다마스토르 9, 야스코니우스 9
  - 커밋: b6f668d, 6cc928a, a021d67, b1be75e, 679e2eb, 26c98d4, 0afbbb1, 347b4c4
- 유물 마미 와타의 거울(mami-wata-mirror)을 아다마스토르 토벌 보상 유물로 추가했다. 처음에는 항해 속도 +14% 희귀 유물이었으나 d3f022b에서 전설 유물로 바꿨다. 전설 유물은 레벨이 없고 고정 효과(system)를 가진다: 네임드 토벌 하루 상한 +1(namedCapBonus), 네임드 납품 골드 30% 감소(namedRewardCut 0.3). 교환 재료는 흐려진 손거울이다. 길드 오늘 기여 상한 계산(guildDailyContributionCaps)이 보유 유물을 받아 네임드 토벌 상한 가산을 반영한다.
  - 마미 와타의 거울 효과: 이전 없음(처음 추가 때 항해 속도 +14%), 이후 네임드 토벌 하루 상한 +1, 네임드 납품 골드 -30%
  - 커밋: b6f668d, d3f022b, c69fd8f
- 유물 바깥섬의 봉돌(outer-isle-sinker, 희귀)을 야스코니우스 토벌 보상으로 추가했다. 효과는 입질 대기 감소(biteWaitCut) 10%이고 레벨 계수를 곱한다. 교환 재료는 그을린 봉돌이다. 유효 입질 대기 계산(stats)이 유물 감소율을 대기 합계에 비율로 건다.
  - 입질 대기 감소 효과(바깥섬의 봉돌): 이전 없음, 이후 Lv1 10%, 레벨 계수 적용 시 Lv5 20%
  - 커밋: 6cc928a, a021d67
- 유물 레벨업을 추가했다. 레벨 유물은 희귀와 영웅이고 전설 유물은 레벨이 없다. 최고 레벨 ARTIFACT_MAX_LEVEL=5, 레벨 계수 ARTIFACT_LEVEL_COEF=[1, 1.25, 1.5, 1.75, 2]를 Lv1 효과에 곱한다. 다음 레벨 비용은 교환 재료 2^(목표 레벨-2)개(Lv2 1개, Lv3 2개, Lv4 4개, Lv5 8개)다. 규칙 canLevelUpArtifact, 행동 levelUpArtifact, 세이브 필드 artifactLevels(값이 없으면 Lv1)를 더했고 서버가 같은 규칙으로 검증한다. 가방의 유물 상세 창(ArtifactDetail)에 현재/강화 후 비교 표와 강화 버튼을 넣었다.
  - 유물 최고 레벨: 이전 없음, 이후 5
  - 유물 레벨 계수: 이전 없음, 이후 Lv1 1, Lv2 1.25, Lv3 1.5, Lv4 1.75, Lv5 2
  - 강화 비용(교환 재료 개수): 이전 없음, 이후 Lv2 1, Lv3 2, Lv4 4, Lv5 8
  - 커밋: d3f022b, 2521253, 773f678, 6650330, 8f7b889, f7b71c9

### UI

- 헤더 자원 바를 골드, 명성, 배, 낚싯대, 가방 다섯 칸 한 행으로 재구성했다. 가방은 게이지 88px와 백분율 15px로 보이고 수량은 툴팁에 있다. 골드와 명성은 유효숫자 3자리로 줄여 표시한다. 모바일은 두 행(1행 네 칸, 2행 가방 게이지)이다. 헤더 높이는 스테이지 폭 960px 미만 40px, 이상 60px(HeaderFrame)였다.
  - PC 헤더 자원 바 칸: 이전 골드, 명성, 가방 세 칸과 의뢰 현황, 이후 골드, 명성, 배, 낚싯대, 가방 다섯 칸
  - 커밋: b3c8870, 667f0af, 4d1d894, ccd5377, e673f05, 7675310
- 게임 시계를 메뉴 버튼 옆, 미니맵 안, 거점 그림 안에서 지우고 칩 줄로 옮겼다. 칩 줄 순서는 접속 칩, 미끼 칩, 시계, 지도 버튼이고 시계는 늘 그린다.
  - 커밋: e673f05
- 메뉴 줄 맨 위에 의뢰 항목을 두고 오늘 남은 클리어 배지(일반 gold, 네임드 epic)를 붙였다. 항목을 누르면 읽기 전용 의뢰 창(QuestInfoWindow)이 열려 일반 의뢰와 네임드 토벌 탭, 진행 값, 흔적을 보여 준다. 헤더의 의뢰 현황(QuestStatus)은 삭제했다.
  - 오늘 남은 클리어 표시 위치: 이전 헤더 의뢰 현황 칸, 이후 메뉴 줄의 의뢰 항목 배지
  - 커밋: 7ff2737, b1a06e5, cdfcd89, 85ee828, 8ba43e8, 7dc500f
- 보정 금액 컴포넌트 AdjustedAmount를 추가해 네임드 보상과 판매액 표기를 통일했다. 보정이 있으면 원본에 취소선, 바뀐 금액을 함께 보이고 툴팁에 기본 금액, 사유별 증감, 합계를 보인다. 도감 상세, 수배판 카드, 의뢰 정보 창, 판매 패널의 소계와 버튼이 같은 값을 쓴다. 직접 표기를 검사하는 uiGuard를 더했다.
  - 커밋: 260e0d8, 1f6c9c7, 7d2fb1c, 1e4765a, bbbaa84, b65cfc1
- 거점 시설 라벨을 제목과 설명 구조로 나누고, 거점 메뉴 카드가 영역 크기에 맞게 줄고 생략 글자는 툴팁으로 보이게 했다. 유물 효과 값을 소수 둘째 자리로 표기하고 네임드 카드를 3:2 비율로 바꿨다. 창 스크롤을 카드 본문 한 곳으로 통일하고 비교 표 열 폭을 모바일 폭에 맞췄다. 어종 이름 띄어쓰기 규칙을 적용했고(황금잉어는 황금 잉어 등) 범상어 돌연변이 이름을 황범상어로 정정했다.
  - 어종 이름 표기: 이전 황금잉어, 무지개송어, 심해오징어, 나폴레옹자리돔, 호주연어, 남방오징어 등 붙여 씀, 이후 황금 잉어, 무지개 송어, 심해 오징어, 나폴레옹 자리돔, 호주 연어, 남방 오징어 등 띄어 씀
  - 범상어 돌연변이 이름: 이전 황범 상어, 이후 황범상어
  - 커밋: ac81203, d810dcb, 128f049, 3c26ba0, f7ac6a7, 702975c, 1bbf99c, 5709994, 414d2c3, 298edc9, 61c1770, 34269d7, 8ff2376
- 모바일 레이아웃 판정을 뷰포트 폭 1024px 하나로 통일했다. 임의 값을 mobile 변형으로 교체하고 지원 크기에서 늘 거짓인 820px 상하 스택과 PC 헤더의 스테이지 폭 축소 단계를 제거했다.
  - 모바일 레이아웃 판정 기준: 이전 컴포넌트마다 다른 폭 값(820px 상하 스택 등), 이후 뷰포트 폭 1024px 하나
  - 커밋: 7af011a, 24cd7d1, 6b22c6f, de048eb, f39f931

### 밸런스

- 의뢰 라이선스 판정을 명성과 도감에서 도감 하나로 바꿨다. BOUNTY_LICENSE_FAME, LICENSE_FAME_MULT, 진입 배 계산 함수를 삭제했고 licenseConditions의 조건 키가 도감 하나로 줄었다. canAcceptQuest의 명성 미달 거부를 지우고, 의뢰 구역과 다른 항구에서의 수주 거부를 추가했다(의뢰는 그 구역 항구의 수배판에서만 수주).
  - 의뢰 라이선스 명성 조건: 이전 태평양 1500, 동남아 20000, 인도양 80000, 마다가스카르 300000 (검증만, 차감 없음), 이후 없음
  - 의뢰 수주 조건: 이전 명성과 구역 도감, 이후 구역 도감만, 그 구역 항구의 수배판에서만 수주
  - 영향: 명성이 낮아도 도감 조건만 채우면 수주할 수 있다. 되돌리려면 7fba409를 되돌려 라이선스 명성 표와 명성 거부를 복원한다.
  - 커밋: 7fba409, a3e64f4
- 배 명성 하한을 기하 스케일링(직전 배 가방 용량 x 일반 어종 5 x 가속 계수 k) 대신 해역 사다리에 맞춰 확정한 표 값으로 바꿨다. 조각배, 돛단배, 정크선은 기존 값 그대로다.
  - 범선 명성 하한: 이전 11000, 이후 5500
  - 증기선 명성 하한: 이전 24000, 이후 10000
  - 대양선 명성 하한: 이전 50000, 이후 30000
  - 원양어선 명성 하한: 이전 100000, 이후 55000
  - 영향: 배 구매가 더 이른 명성에서 열린다. 되돌리려면 boats.ts의 명성 값을 이전 값으로 복원한다.
  - 커밋: 66ec76f, 8be9a09, 0322aef
- 배 가격(범선부터 대양 트롤선까지)을 다음 해역으로 가는 전환에 드는 골드의 15%로 정하고 앞 두 자리 유효숫자의 둘째 자리를 0 또는 5로 반올림하는 규칙으로 바꿨다. 범선은 정크선(6000)보다 저렴해졌다.
  - 범선 가격: 이전 15000, 이후 4500
  - 증기선 가격: 이전 32000, 이후 9500
  - 영향: 두 배를 사는 데 드는 골드가 줄어 해역 진행이 빨라진다. 되돌리려면 boats.ts의 가격을 복원한다.
  - 커밋: 66ec76f, 8be9a09, 0322aef
- 대양선 가격을 같은 규칙(다음 해역 전환 골드의 15%, 둘째 자리 0 또는 5 반올림)으로 다시 산정했다. 원양어선 가격 150000은 그대로다.
  - 대양선 가격: 이전 70000, 이후 80000
  - 영향: 대양선 구매가 10000골드 비싸졌다. 되돌리려면 boats.ts의 가격을 70000으로 복원한다.
  - 커밋: 66ec76f, 8be9a09, 0322aef
- 의뢰와 네임드 토벌 보상을 구역 대표 방치 EV(구역 마지막 해역 딱렙)의 쉬움 1시간, 보통 2시간, 어려움 4시간, 네임드 8시간어치로 다시 산정했다. 5나 10 단위로 반올림하고 값은 밸런스 도구로 산출한다. 이전 규칙은 난이도 보상이 그 난이도 의뢰들 판매가 평균의 15배, 네임드는 10배였다. 남대서양 보상표를 새로 더했다.
  - 태평양 보상(쉬움/보통/어려움/네임드): 이전 20000/40000/80000/400000, 이후 20000/40000/85000/150000
  - 동남아 보상(쉬움/보통/어려움/네임드): 이전 80000/150000/300000/1500000, 이후 70000/150000/300000/550000
  - 인도양 보상(쉬움/보통/어려움/네임드): 이전 150000/350000/700000/3500000, 이후 150000/300000/600000/1000000
  - 마다가스카르 보상(쉬움/보통/어려움/네임드): 이전 225000/500000/1000000/5000000, 이후 350000/750000/1500000/3000000
  - 남대서양 보상(쉬움/보통/어려움/네임드): 이전 없음, 이후 950000/2000000/4000000/7500000 (네임드 아다마스토르와 야스코니우스 각각)
  - 영향: 구역별 의뢰 수입이 달라진다. 태평양 어려움과 동남아 쉬움, 인도양, 마다가스카르 네임드 일부는 줄고 마다가스카르 쉬움부터 어려움은 늘었다. 되돌리려면 bounties.ts 보상표를 복원한다.
  - 커밋: 859a344, 85e5364, 3ddaf5a, 80ca04b, 6d726d0, d91fc26, b6f668d
- 해역 요구 파워를 조정했다(낚싯대 1레벨당 파워 5). 공개 문안은 코론 침선 지대와 남인도양을 적었으나 v0.17.1과 v0.18.0의 데이터를 비교하면 이 두 해역의 값은 그대로(코론 60, 남인도양 95)고, 바뀐 해역은 아래 표와 같다.
  - 태평양 요구 파워: 이전 35, 이후 30 (Lv5)
  - 드래곤 홀 요구 파워: 이전 55, 이후 50 (Lv9)
  - 코론 침선 지대 요구 파워: 이전 60, 이후 60 (변경 없음, Lv11)
  - 그레이트 배리어 리프 요구 파워: 이전 65, 이후 70 (Lv13)
  - 인도양 요구 파워: 이전 85 (Lv16), 이후 80 (Lv15)
  - 남인도양 요구 파워: 이전 95, 이후 95 (변경 없음, Lv18)
  - 코모로 심해 요구 파워: 이전 115 (Lv22), 이후 120 (Lv23)
  - 모잠비크 해협 요구 파워: 이전 105, 이후 105 (변경 없음, Lv20)
  - 영향: 해역 진입 요구 파워가 해역마다 오르거나 내려 진입 시점과 미달 페널티 구간이 달라진다. 되돌리려면 spots.ts의 powerReq를 복원한다.
  - 커밋: 1a0e73b, 06bda0c
- 해역 간 수익 단계 규칙에 맞춰 태평양, 마리아나 해구, 드래곤 홀, 그레이트 배리어 리프, 인도양, 남인도양, 모잠비크 해협, 코모로 심해의 어종 판매가를 조정했고 가격 반올림을 가격 사다리 규칙으로 정정했다. 등급 가중치는 전역 표(일반 75, 희귀 20, 영웅 5, 전설 1)와 해역별 덮어쓰기 대신 만분율(합 10000) 프리셋으로 바꿨다. 덮어쓰기가 없는 해역은 소속 지역이 가장 최근 지역에서 몇 단계 전인지에 따라 프리셋을 쓴다. 인도양, 남인도양, 모잠비크 해협, 코모로 심해의 덮어쓰기를 제거했다.
  - 등급 가중치 프리셋 latest (희귀/영웅/전설, 만분율): 이전 전역 가중치 75/20/5/1(합 101) 또는 해역 덮어쓰기, 이후 2000/300/10, 일반은 나머지
  - 등급 가중치 프리셋 previous: 이전 위와 같음, 이후 2000/400/55, 일반은 나머지
  - 등급 가중치 프리셋 stable: 이전 위와 같음, 이후 2000/500/100, 일반은 나머지
  - 코론 침선 지대 등급 가중치: 이전 희귀 20, 영웅 9, 일반 70, 이후 2000/900/100 (만분율)
  - 그레이트 배리어 리프 등급 가중치: 이전 일반 74, 희귀 23, 전설 3, 이후 2300/0/300 (영웅 어종 없음)
  - 인도양, 남인도양, 모잠비크 해협, 코모로 심해 등급 가중치 덮어쓰기: 이전 인도양 328/54/16/2, 남인도양 288/56/30/2, 모잠비크와 코모로 288/56/30 (일반/희귀/영웅/전설), 이후 덮어쓰기 제거(지역 단계 프리셋)
  - 바다(sea) 어종 판매가: 이전 고등어 9, 갈치 10, 참돔 50, 방어 55, 참치 250, 백상아리 1500, 달무리 3000, 이후 고등어 10, 갈치 11, 참돔 75, 방어 80, 참치 360, 백상아리 2200, 달무리 4400
  - 심해(deep) 어종 판매가: 이전 아귀 12, 심해 오징어 90, 실러캔스 350, 산갈치 360, 크라켄 2000, 밤의 장막 4000, 이후 아귀 13, 심해 오징어 130, 실러캔스 520, 산갈치 530, 크라켄 3000, 밤의 장막 6000
  - 드래곤 홀 어종 판매가: 이전 바다의 용 4500, 야룡 7000, 이후 바다의 용 5100, 야룡 7900
  - 그레이트 배리어 리프 어종 판매가: 이전 산호의 왕 4500, 부냅 4800, 월광 산호어 1800, 꿈의 왕 7000, 이후 산호의 왕 4300, 부냅 4600, 월광 산호어 1100, 꿈의 왕 6700
  - 인도양 어종 판매가: 이전 청새치 4500, 마카라 17500, 별지느러미 7000, 바다의 거울 30000, 이후 청새치 2600, 마카라 14000, 별지느러미 4000, 바다의 거울 24000
  - 남인도양 어종 판매가: 이전 꽁치 29, 정어리 32, 남방 오징어 800, 혼상어 900, 눈다랑어 3500, 고래상어 4000, 바루나 20000, 서리밤 정어리 1800, 오로라 물고기 6000, 심연의 침묵 36000, 이후 꽁치 25, 정어리 27, 남방 오징어 680, 혼상어 770, 눈다랑어 3200, 고래상어 3700, 바루나 25000, 서리밤 정어리 1500, 오로라 물고기 5500, 심연의 침묵 46000
  - 모잠비크 해협 어종 판매가: 이전 날치 35, 가다랑어 37, 갑오징어 40, 왕고등어 1500, 귀상어 4800, 대왕 쥐가오리 36000, 달빛 날치 3000, 별 갑오징어 8000, 밤의 쥐가오리 58200, 이후 날치 44, 가다랑어 46, 갑오징어 50, 왕고등어 2100, 귀상어 9500, 대왕 쥐가오리 74000, 달빛 날치 4200, 별 갑오징어 16000, 밤의 쥐가오리 120000
  - 코모로 심해 어종 판매가: 이전 등불고기 42, 심해 장어 45, 유리문어 2400, 주름 상어 6000, 도깨비상어 7200, 메가마우스 45000, 상층 등불고기 4500, 심연 유리문어 10400, 칠흑의 메가마우스 73200, 이후 등불고기 40, 심해 장어 43, 유리문어 2300, 주름 상어 9300, 도깨비상어 12000, 메가마우스 78000, 상층 등불고기 4300, 심연 유리문어 16000, 칠흑의 메가마우스 120000
  - 영향: 해역별 등급 확률과 판매 수입이 달라진다. 전설 확률은 최신 지역 0.1%, 한 단계 전 0.55%, 안정화 1%다. 되돌리려면 rarityWeights.ts와 fish.ts, spots.ts의 가중치 덮어쓰기를 복원한다.
  - 커밋: 3ebc818, 4023223, 05a9779, 11e475f, 476f558, fb5ef78, 5d1c1ab, fa2eaed, 2a48953
- 방치 낚시의 일반 등급 가중치 배수를 낚싯대 곡선(×10에서 ×4로 완화)에서 해역 요구 파워 대비 낚싯대 레벨 차 표로 바꿨다. 레벨 차는 요구 파워를 넘은 파워를 5로 나눈 몫이고 미달은 0으로 본다. 마을 해역과 태평양 이후 해역의 표가 다르다(IDLE_BOOST_STEPS). 배수가 클수록 일반 어종 비중이 커져 희귀 이상이 적게 나온다. 옛 곡선 코드(AUTO_COMMON_BOOST, ROD.curveK, rodCurveT)를 삭제했다.
  - 방치 배수 산식: 이전 일반 가중치 x10에서 x4로 낚싯대 곡선 t = 1 - 1/(1 + 0.15 x (Lv-1))에 따라 완화(해역 진입 대비 초과 5당 1 감소, 하한 4), 이후 레벨 차 표
  - 태평양 이후 해역 방치 배수(레벨 차 0, 1, 2, 3, 4 이상): 이전 10, 9, 8, 7, 6 ... 하한 4, 이후 5, 5, 4, 4, 3
  - 마을 해역 방치 배수(레벨 차 0부터): 이전 10에서 4로 완화, 이후 10, 9, 8, 7, 6, 5, 4
  - 영향: 태평양 이후 해역에서 방치 시 희귀 이상 등급 비율이 올라간다. 되돌리려면 b80ca86을 되돌린다.
  - 커밋: b80ca86, a0c176c, f9d9b61, 3fac303
- 파워 미달 확률 페널티를 낚싯대 레벨 단위로 바꿨다(POWER_RULES.shortStep 10에서 5). 미달 일반 가중치 배수는 부족 낚싯대 레벨 1단계마다 2배, 4레벨 이상은 x16이다. 입질 대기 가산은 부족/5초에서 부족/4초가 됐다. 요구 파워를 넘을 때 입질 대기를 최대 30% 줄이던 보정(진입 파워의 10배에서 최대)과 수동 낚시 확률 보정(초과 5당 x0.1, 최대 x2.0)은 삭제했다.
  - 미달 일반 가중치 배수: 이전 min(16, 2^(floor(부족/10)+1)), 이후 min(16, 2^ceil(부족/5))
  - 미달 입질 대기 가산: 이전 부족/5초, 이후 부족/4초
  - 파워 초과 시 입질 대기 단축: 이전 진입 파워 대비 최대 30% 단축, 이후 없음(낚싯대 레벨 곡선 그대로)
  - 수동 낚시 확률 보정: 이전 초과 5당 x0.1, 최대 x2.0, 이후 삭제
  - 영향: 요구 파워에 모자란 해역에서 페널티가 레벨 단위로 단순해지고 초과 파워의 이득은 방치 배수 표로만 남는다. 되돌리려면 59fddb4, b80ca86을 되돌린다.
  - 커밋: 59fddb4, b80ca86
- 도보 속도와 배별 속도를 올렸다. 대양 트롤선(8단계)의 속도는 200이다.
  - 마을 도보 속도(WALK_SPEED): 이전 80, 이후 100
  - 조각배 속도: 이전 85, 이후 110
  - 돛단배 속도: 이전 100, 이후 120
  - 정크선 속도: 이전 115, 이후 130
  - 범선 속도: 이전 130, 이후 140
  - 증기선 속도: 이전 145, 이후 150
  - 대양선 속도: 이전 160, 이후 165
  - 원양어선 속도: 이전 175, 이후 180
  - 대양 트롤선 속도: 이전 없음, 이후 200
  - 영향: 이동이 빨라져 판매 왕복 시간이 줄어든다. 되돌리려면 boats.ts의 speed와 balance.ts의 WALK_SPEED를 복원한다.
  - 커밋: 4166239

### 수정

- 어시장 판매 버튼이 길드 판매가 보너스를 반영하지 않은 기본 금액을 보였다. 길드 판매가 보너스를 판매 패널에 전달하고 소계와 판매 버튼이 보정 금액(AdjustedAmount)으로 같은 값을 그리게 했다. 판매 행별 소계는 기본가 합으로 되돌렸다.
  - 커밋: 260e0d8, b65cfc1, 7d2fb1c
- 여객선 이동에서 도착 위치가 반영되지 않거나 효과 재실행으로 이동이 두 번 실행되던 문제를 고쳤다. 필드 엔진에 조작 잠금과 플레이어 위치 재설정을 추가하고, 전환 중 거점 이동 카드를 잠그고 중복 전환을 막았다. 지역 이동 전환 덮개를 화면 전체 덮개로 바꿨다.
  - 커밋: d12e3d2, 5646192, 57ffc57, 6a37b15, 8cbf695, fe6767c
- 세로로 긴 시야에서 비네팅 그라데이션이 뒤집히던 문제, 구역 경계에 막힌 채 키를 누르고 있을 때 안내가 반복되던 문제(한 번만 표시), 어군 후보 칸에 통행할 수 없는 창 가장자리 칸이 들던 문제, 네임드 전승 칸의 이중 스크롤, 줄 수 고정 칸의 다음 줄 비침, 관리자 표 칸의 가로 스크롤을 고쳤다.
  - 커밋: f0c9436, 27e2a3d, 8fb6949, 99b19e4, 3494a5d, 6d66e15, d836b56, b168249

### 기타

- 게임 좌표 원점을 지역별 원점에서 전지구 고정 원점으로 바꿨다. 마스크 생성기가 전지구 고정 원점 좌표를 내보내고 재접속 시작점의 창 밖 기록과 출발점 재개를 검증한다. 데이터 형식이 바뀌는 변경이라 기존 저장 위치는 위생 처리를 거친다.
  - 게임 좌표 원점: 이전 지역별 원점, 이후 전지구 고정 원점
  - 커밋: 90631df, 9620b06, 1492b58, a776b96
- 실시간 채널 연결 시 클라이언트 빌드를 서버가 검사하도록 했다(live 규칙). 낡은 빌드의 연결에도 소켓 오류 처리를 붙였다.
  - 커밋: 97fc243, fb174f3
- Storybook과 스토리 전용 코드를 제거했다. node 타입은 테스트 파일에만 선언한다.
  - 커밋: 325de43, bea31ed
- 밸런스 측정의 방치 축을 진입(레벨 차 0)과 플래토(하한)로 바꾸고 이동 직후 수입과 PERFECT 이상치 검사를 더했다. 수동 보정과 입질 단축을 모델에서 제거했고 여유 스펙을 진입 레벨 +4로 바꿨다. 플레이 유형별 진행 시뮬레이션, 해역 전환과 예외 흐름 지표, 최초 10분 수동 낚시 지표, 방치 EV 명령을 추가했다. 관리자 대시보드의 방치 고정 다이얼도 진입과 플래토로 바꿨다.
  - 측정의 방치 축: 이전 낚싯대 곡선 기반 완화, 이후 진입(레벨 차 0)과 플래토(하한) 두 값
  - 커밋: 14dd10b, 051bae9, c09ea3b, 260b670, 8478b4b, 6d44bb5, a6d3988, f9e535a
- 마스크 생성기에 작은 섬 스탬프를 추가했다. openZones로 통행 불가 육지 띠를 칠하는 기능은 넣었다가 되돌렸다(fd0dbcf).
  - 커밋: 9620b06, 97fb0d3, fd0dbcf, d040d37

## [0.17.1] - 2026-11-06

### UI

- 미확인
  - 커밋: 5428a08, afb067f, fc24779, 2dabfe0, 7b63ee8, cc4618a

### 수정

- 미확인
  - 커밋: 5428a08, afb067f, fc24779, 2dabfe0, 7b63ee8, cc4618a
- 미확인
  - 커밋: 5428a08, afb067f, fc24779, 2dabfe0, 7b63ee8, cc4618a

## [0.17.0] - 2026-11-06

### 기능

- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf

### UI

- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf
- 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: 33ce2e5, 1c50ec5, 70a1a21, dccd22d, f3599cc, e92f388, 5cdee78, a2d8344, cd0b850, 503ef6e, 9347644, 0fb69d3, 7c1f3e2, f2ea88a, ed05f5a, a6f6b73, cf0cf82, be39c31, ebc4b1f, 2f0ba9f, dbb8719, 06443cd, c93bcff, dd5df2a, 1854957, f2d2bf8, e530fbb, f833622, 8a3a565, c584c0e, 8daa785, 2829eec, f44f3fb, 2343e61, e5a9cf6, 2022469, 26c2ff6, 86200c5, bb08528, f3fab02, 7fc4709, 1da71e7, 7214fa7, c9d6807, 6fc4f1c, 983c954, 831ff7a, ba88ae5, 8eb1eb4, f970816, 89dce46, 4ea1510, b38a988, fde319e, d19dd2e, 7da7389, d199e60, 481a6bd, eb86fdc, 0f24306, b7b54ad, eff5d6f, 09e3f8a, 11c3b00, 29f64a0, 2c0113e, 354cbb1, 29bb423, da9f47e, f37af31, da0f7d1, f5b89bf

## [0.16.0] - 2026-11-06

### 기능

- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850

### UI

- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
  - 영향: 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850

## [0.15.4] - 2026-11-05

### 수정

- 미확인
  - 커밋: f20f495, d7ecab3, cb47cbb

## [0.15.3] - 2026-11-05

### 기능

- 미확인
  - 커밋: 099a36a, 5d472fe, 522abcb

### UI

- 미확인
  - 커밋: 099a36a, 5d472fe, 522abcb

### 수정

- 미확인
  - 커밋: 099a36a, 5d472fe, 522abcb

## [0.15.2] - 2026-11-05

### UI

- 미확인
  - 커밋: c8260a6, dea69b8, 18de942

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: c8260a6, dea69b8, 18de942
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: c8260a6, dea69b8, 18de942

## [0.15.1] - 2026-11-04

### 수정

- 미확인
  - 커밋: 4fc0983, 2765c11, 5525c1b

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: 4fc0983, 2765c11, 5525c1b

## [0.15.0] - 2026-11-04

### 기능

- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310
- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310
- 미확인
  - 영향: 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310
- 미확인
  - 영향: 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310

### UI

- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310

### 수정

- 미확인
  - 영향: 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310

### 기타

- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310
- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310
- 미확인
  - 영향: 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310
- 미확인
  - 영향: 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310

## [0.14.1] - 2026-11-02

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: 6738b7a, 5412d0c, 180fb0e, a850785, 3e3b896, a3f8e35
- 미확인
  - 영향: 미확인
  - 커밋: 6738b7a, 5412d0c, 180fb0e, a850785, 3e3b896, a3f8e35
- 미확인
  - 영향: 미확인
  - 커밋: 6738b7a, 5412d0c, 180fb0e, a850785, 3e3b896, a3f8e35

## [0.14.0] - 2026-10-23

### 기능

- 미확인
  - 커밋: 672c988, 3a66ed9, 1f49dfc, afe426c, c329491, 0f2cd4f, cb4c932, 4353aa4, f23dbe0, 70ea437, 2e3ece9, 25db6fd, cd21054, 019779e, 1cac0ab
- 미확인
  - 커밋: 672c988, 3a66ed9, 1f49dfc, afe426c, c329491, 0f2cd4f, cb4c932, 4353aa4, f23dbe0, 70ea437, 2e3ece9, 25db6fd, cd21054, 019779e, 1cac0ab
- 미확인
  - 커밋: 672c988, 3a66ed9, 1f49dfc, afe426c, c329491, 0f2cd4f, cb4c932, 4353aa4, f23dbe0, 70ea437, 2e3ece9, 25db6fd, cd21054, 019779e, 1cac0ab
- 미확인
  - 커밋: 672c988, 3a66ed9, 1f49dfc, afe426c, c329491, 0f2cd4f, cb4c932, 4353aa4, f23dbe0, 70ea437, 2e3ece9, 25db6fd, cd21054, 019779e, 1cac0ab

### 기타

- 미확인
  - 커밋: 672c988, 3a66ed9, 1f49dfc, afe426c, c329491, 0f2cd4f, cb4c932, 4353aa4, f23dbe0, 70ea437, 2e3ece9, 25db6fd, cd21054, 019779e, 1cac0ab
- 미확인
  - 영향: 미확인
  - 커밋: 672c988, 3a66ed9, 1f49dfc, afe426c, c329491, 0f2cd4f, cb4c932, 4353aa4, f23dbe0, 70ea437, 2e3ece9, 25db6fd, cd21054, 019779e, 1cac0ab

## [0.13.2] - 2026-10-22

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 8364bad, 1b5b7a0, daf8726, 0413485, b6cab5e, 84c7f4e, 5dcb859
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 8364bad, 1b5b7a0, daf8726, 0413485, b6cab5e, 84c7f4e, 5dcb859
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 8364bad, 1b5b7a0, daf8726, 0413485, b6cab5e, 84c7f4e, 5dcb859
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 8364bad, 1b5b7a0, daf8726, 0413485, b6cab5e, 84c7f4e, 5dcb859

### 기타

- 미확인
  - 커밋: 8364bad, 1b5b7a0, daf8726, 0413485, b6cab5e, 84c7f4e, 5dcb859

## [0.13.1] - 2026-10-22

### UI

- 미확인
  - 커밋: 9718436, be9a64c, 3a7bbf3, 943615c, 676acfa, bbbbc82, e2a4d8f, 9c540a7, 60894bd

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 9718436, be9a64c, 3a7bbf3, 943615c, 676acfa, bbbbc82, e2a4d8f, 9c540a7, 60894bd
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 9718436, be9a64c, 3a7bbf3, 943615c, 676acfa, bbbbc82, e2a4d8f, 9c540a7, 60894bd

### 수정

- 미확인
  - 커밋: 9718436, be9a64c, 3a7bbf3, 943615c, 676acfa, bbbbc82, e2a4d8f, 9c540a7, 60894bd
- 미확인
  - 커밋: 9718436, be9a64c, 3a7bbf3, 943615c, 676acfa, bbbbc82, e2a4d8f, 9c540a7, 60894bd
- 미확인
  - 커밋: 9718436, be9a64c, 3a7bbf3, 943615c, 676acfa, bbbbc82, e2a4d8f, 9c540a7, 60894bd
- 미확인
  - 커밋: 9718436, be9a64c, 3a7bbf3, 943615c, 676acfa, bbbbc82, e2a4d8f, 9c540a7, 60894bd

## [0.13.0] - 2026-10-20

### 기능

- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b

### UI

- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b
- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b
- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b
- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b
- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b
- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b

### 수정

- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b
- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b

### 기타

- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b
- 미확인
  - 커밋: 96520c3, 3d1957e, 7ab777a, 566a3fb, 7540b04, 4e7ba09, 608ff7d, e0bfa4c, 28d9ab5, 497ca86, 35f904d, e7accea, 5700f0f, a8fd648, fccd49b

## [0.12.1] - 2026-10-19

### 기능

- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701

### UI

- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701

## [0.12.0] - 2026-10-18

### 기능

- 미확인
  - 커밋: a21cd58, 662981e, ae46252, fc7d3e6, 79eedad, 136521c, a61b13d, 3400f3f, 13adb5a, 8c000a9, 5342e88, 96fac74, cc98672, db4d222, f64c176, d384b43, 1efa405, 7f6f7e4, 2ba04e8
- 미확인
  - 커밋: a21cd58, 662981e, ae46252, fc7d3e6, 79eedad, 136521c, a61b13d, 3400f3f, 13adb5a, 8c000a9, 5342e88, 96fac74, cc98672, db4d222, f64c176, d384b43, 1efa405, 7f6f7e4, 2ba04e8

### UI

- 미확인
  - 커밋: a21cd58, 662981e, ae46252, fc7d3e6, 79eedad, 136521c, a61b13d, 3400f3f, 13adb5a, 8c000a9, 5342e88, 96fac74, cc98672, db4d222, f64c176, d384b43, 1efa405, 7f6f7e4, 2ba04e8
- 미확인
  - 커밋: a21cd58, 662981e, ae46252, fc7d3e6, 79eedad, 136521c, a61b13d, 3400f3f, 13adb5a, 8c000a9, 5342e88, 96fac74, cc98672, db4d222, f64c176, d384b43, 1efa405, 7f6f7e4, 2ba04e8
- 미확인
  - 커밋: a21cd58, 662981e, ae46252, fc7d3e6, 79eedad, 136521c, a61b13d, 3400f3f, 13adb5a, 8c000a9, 5342e88, 96fac74, cc98672, db4d222, f64c176, d384b43, 1efa405, 7f6f7e4, 2ba04e8
- 미확인
  - 커밋: a21cd58, 662981e, ae46252, fc7d3e6, 79eedad, 136521c, a61b13d, 3400f3f, 13adb5a, 8c000a9, 5342e88, 96fac74, cc98672, db4d222, f64c176, d384b43, 1efa405, 7f6f7e4, 2ba04e8

### 기타

- 미확인
  - 커밋: a21cd58, 662981e, ae46252, fc7d3e6, 79eedad, 136521c, a61b13d, 3400f3f, 13adb5a, 8c000a9, 5342e88, 96fac74, cc98672, db4d222, f64c176, d384b43, 1efa405, 7f6f7e4, 2ba04e8
- 미확인
  - 커밋: a21cd58, 662981e, ae46252, fc7d3e6, 79eedad, 136521c, a61b13d, 3400f3f, 13adb5a, 8c000a9, 5342e88, 96fac74, cc98672, db4d222, f64c176, d384b43, 1efa405, 7f6f7e4, 2ba04e8

## [0.11.0] - 2026-10-18

### 기능

- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df

### UI

- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df

### 수정

- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df

### 기타

- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df
- 미확인
  - 커밋: 00f7c22, 89338f1, 9b5c929, 8cfae61, cfff0ce, ef97cd0, fcef592, 3d194ea, 64f497f, 3a33621, d6e017e, 7ae505b, f754eb1, d72f245, b8c12d8, 8b24446, 45dd68e, b9af89b, e4675c4, 7987f0e, 166142f, 0d1aa5d, 44bb0f5, cd27aa9, 3ffd7b1, 743f544, 182f1c4, c392b0c, 89c8e9f, 59cb21f, da270df

## [0.10.5] - 2026-10-17

### 기타

- 미확인
  - 커밋: 68c96db, 4817a96, a7c522f, 4d51f7f, cbaa0d8, 48836be, c7a6227, 4d30f99
- 미확인
  - 영향: 미확인
  - 커밋: 68c96db, 4817a96, a7c522f, 4d51f7f, cbaa0d8, 48836be, c7a6227, 4d30f99

## [0.10.4] - 2026-10-17

### 기능

- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00

### UI

- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00

### 수정

- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00

### 기타

- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00
- 미확인
  - 커밋: 84daebd, 45a1c03, aa6d8de, 45f604f, 2a2c013, aa5399e, 9b477f5, da81107, 9a59bca, 0dc20a3, 3404a7a, 415a30b, 7f9f8e3, 5ff22c5, 58db3bd, a3d1c51, 02e532e, 3ff2a2c, adfe600, fdc2673, 60fa9bb, 0fa979d, 690ffcb, 3a53e7c, a5cc946, ccc5f6e, 7041ffb, ee27b00

## [0.10.3] - 2026-10-17

### UI

- 미확인
  - 커밋: 6e08175, 5c902db, 29ff542
- 미확인
  - 커밋: 6e08175, 5c902db, 29ff542

### 수정

- 미확인
  - 영향: 미확인
  - 커밋: 6e08175, 5c902db, 29ff542

## [0.10.2] - 2026-10-17

### 기능

- 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1
- 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1

### UI

- 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1
- 미확인
  - 영향: 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1

### 수정

- 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1
- 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1

## [0.10.1] - 2026-10-17

### 기능

- 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35
- 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35

### UI

- 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35
- 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35

### 수정

- 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35

### 기타

- 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35
- 미확인
  - 커밋: 4f7ef55, e8cf3fa, 70eaeac, e12da8c, 3cb76c0, 3948691, ef24cbc, 528978b, 97e4382, f41fd35

## [0.10.0] - 2026-10-16

### 기능

- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc

### UI

- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc

### 기타

- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 영향: 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc
- 미확인
  - 커밋: 7aa4bcc, a0bc7ff, 6118563, e9fc276, b67d2ec, eca3d94, d87ef53, 4e7d72a, a0ec51b, 67e035d, 5900a89, 2f36600, 6956284, 46506a8, f957bb0, bc15a83, ec15ede, 628d5f7, 5e7f3b9, c6c6ead, c9dedda, 070028e, 82929c9, 380357b, 6ed51f1, 37bd8af, f1d1628, 83961b6, 4716f37, 77ebf68, 4bf5cfb, 084c6b0, 308ab37, 41a9c3f, 1f776e5, 06f9d00, c053c80, 7235b36, 558c8e9, 26bd04f, 7d43d7a, b7d1c45, 18d2133, c650f5f, c8c7701, 6ff05c9, 87aca79, 13b5fcb, 43b8887, 3eef006, ebc8899, 0b1d339, aa5de70, 8a87338, e228dfa, bfac6d5, 660a506, b8d2ec9, e319903, 9a69756, f05e7f6, 1fc2cbd, 3cad55f, a4c0983, f1111bd, f2f9541, 109804e, 5834fb5, e547acf, 4c43b41, d3f8c63, 7703eed, 0eb44f3, 5248213, 1676b54, 109b7c6, 71f8ab9, 450ac8e, 9d166d5, 6a19ce5, 3849265, 86d5ee2, 9e6205e, f4f4aae, ef29f0c, afc37d3, 941c0d6, a53fa9f, 54218bb, 632f66d, a11117a, 86d3886, fdc510a, 4775eea, bcdac92, 6c8cb9b, 6b853d2, 085d7f9, 36bde76, d300913, 51c7d01, 1f1094f, c5b91a6, 725194b, 9cb60ec, ee7b1dd, ee8e2f7, d7ae9bc, 873ec2d, da49231, 6462eab, 4755548, 2abd018, 01e8cb5, 7450dba, 50254d6, 6c9e6d3, 54d22a3, 7ae2d45, 1cc63a7, a8ae748, 48aab70, 6b4ed07, 4432e10, 15caebc

## [0.9.0] - 2026-10-07

### 기능

- 미확인
  - 커밋: 630b80d, 7be5d23, bad544b, d331fcc, b502838

### UI

- 미확인
  - 커밋: 630b80d, 7be5d23, bad544b, d331fcc, b502838
- 미확인
  - 커밋: 630b80d, 7be5d23, bad544b, d331fcc, b502838

## [0.8.3] - 2026-10-07

### 기능

- 미확인
  - 커밋: 28ac48f, 771f354, 2b47e8e, 35eee6f, 99db2e2, af272a8, 0855136, b6f7ed8, 003b106, cb0ca2b, d34b3c8, 6f2c898, 825b371, a1707a6, d58f750
- 미확인
  - 커밋: 28ac48f, 771f354, 2b47e8e, 35eee6f, 99db2e2, af272a8, 0855136, b6f7ed8, 003b106, cb0ca2b, d34b3c8, 6f2c898, 825b371, a1707a6, d58f750
- 미확인
  - 커밋: 28ac48f, 771f354, 2b47e8e, 35eee6f, 99db2e2, af272a8, 0855136, b6f7ed8, 003b106, cb0ca2b, d34b3c8, 6f2c898, 825b371, a1707a6, d58f750

### 수정

- 미확인
  - 영향: 미확인
  - 커밋: 28ac48f, 771f354, 2b47e8e, 35eee6f, 99db2e2, af272a8, 0855136, b6f7ed8, 003b106, cb0ca2b, d34b3c8, 6f2c898, 825b371, a1707a6, d58f750

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: 28ac48f, 771f354, 2b47e8e, 35eee6f, 99db2e2, af272a8, 0855136, b6f7ed8, 003b106, cb0ca2b, d34b3c8, 6f2c898, 825b371, a1707a6, d58f750
- 미확인
  - 영향: 미확인
  - 커밋: 28ac48f, 771f354, 2b47e8e, 35eee6f, 99db2e2, af272a8, 0855136, b6f7ed8, 003b106, cb0ca2b, d34b3c8, 6f2c898, 825b371, a1707a6, d58f750
- 미확인
  - 커밋: 28ac48f, 771f354, 2b47e8e, 35eee6f, 99db2e2, af272a8, 0855136, b6f7ed8, 003b106, cb0ca2b, d34b3c8, 6f2c898, 825b371, a1707a6, d58f750
- 미확인
  - 커밋: 28ac48f, 771f354, 2b47e8e, 35eee6f, 99db2e2, af272a8, 0855136, b6f7ed8, 003b106, cb0ca2b, d34b3c8, 6f2c898, 825b371, a1707a6, d58f750

## [0.8.2] - 2026-09-06

### 기능

- 미확인
  - 커밋: e34eb9f, 3c0d437, a29d805
- 미확인
  - 커밋: e34eb9f, 3c0d437, a29d805
- 미확인
  - 커밋: e34eb9f, 3c0d437, a29d805

### UI

- 미확인
  - 커밋: e34eb9f, 3c0d437, a29d805

### 기타

- 미확인
  - 커밋: e34eb9f, 3c0d437, a29d805

## [0.8.1] - 2026-09-06

### UI

- 미확인
  - 커밋: f4ffa70, 30d8073
- 미확인
  - 커밋: f4ffa70, 30d8073

### 수정

- 미확인
  - 커밋: f4ffa70, 30d8073

## [0.8.0] - 2026-09-06

### 기능

- 미확인
  - 커밋: 861b6ed, 8c18202
- 미확인
  - 커밋: 861b6ed, 8c18202
- 미확인
  - 커밋: 861b6ed, 8c18202

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: 861b6ed, 8c18202
- 미확인
  - 영향: 미확인
  - 커밋: 861b6ed, 8c18202
- 미확인
  - 커밋: 861b6ed, 8c18202
- 미확인
  - 커밋: 861b6ed, 8c18202

## [0.7.2] - 2026-09-06

- 이 버전에 기록된 변경이 없다.

## [0.7.1] - 2026-08-27

### 기능

- 미확인
  - 커밋: c3c1b62, 165dacd, 9510852, 48594c1, 8442347
- 미확인
  - 커밋: c3c1b62, 165dacd, 9510852, 48594c1, 8442347
- 미확인
  - 영향: 미확인
  - 커밋: c3c1b62, 165dacd, 9510852, 48594c1, 8442347

### UI

- 미확인
  - 커밋: c3c1b62, 165dacd, 9510852, 48594c1, 8442347
- 미확인
  - 커밋: c3c1b62, 165dacd, 9510852, 48594c1, 8442347
- 미확인
  - 커밋: c3c1b62, 165dacd, 9510852, 48594c1, 8442347

## [0.7.0] - 2026-08-27

### 기능

- 미확인
  - 커밋: 3f39abb, 06a3a30
- 미확인
  - 커밋: 3f39abb, 06a3a30
- 미확인
  - 커밋: 3f39abb, 06a3a30

### UI

- 미확인
  - 커밋: 3f39abb, 06a3a30

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 3f39abb, 06a3a30

## [0.6.7] - 2026-08-26

### UI

- 미확인
  - 커밋: 5bf7412

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 5bf7412
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 5bf7412

## [0.6.6] - 2026-08-26

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: e87bd77, 1b4086f
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: e87bd77, 1b4086f
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: e87bd77, 1b4086f
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: e87bd77, 1b4086f
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: e87bd77, 1b4086f

### 기타

- 미확인
  - 커밋: e87bd77, 1b4086f

## [0.6.5] - 2026-08-26

- 이 버전에 기록된 변경이 없다.

## [0.6.4] - 2026-08-26

### 기능

- 미확인
  - 커밋: c8b8d5a
- 미확인
  - 커밋: c8b8d5a

### UI

- 미확인
  - 커밋: c8b8d5a
- 미확인
  - 커밋: c8b8d5a
- 미확인
  - 커밋: c8b8d5a
- 미확인
  - 커밋: c8b8d5a

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: c8b8d5a
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: c8b8d5a

### 수정

- 미확인
  - 커밋: c8b8d5a

### 기타

- 미확인
  - 커밋: c8b8d5a

## [0.6.3] - 2026-08-25

### 기능

- 미확인
  - 커밋: 8d25cbf, 5c4399d
- 미확인
  - 커밋: 8d25cbf, 5c4399d
- 미확인
  - 커밋: 8d25cbf, 5c4399d

### UI

- 미확인
  - 커밋: 8d25cbf, 5c4399d

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 8d25cbf, 5c4399d
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 8d25cbf, 5c4399d
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 8d25cbf, 5c4399d
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 8d25cbf, 5c4399d

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: 8d25cbf, 5c4399d

## [0.6.2] - 2026-08-25

### 기능

- 미확인
  - 커밋: 5f6bb8a
- 미확인
  - 커밋: 5f6bb8a
- 미확인
  - 커밋: 5f6bb8a

### UI

- 미확인
  - 커밋: 5f6bb8a

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 5f6bb8a
- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 5f6bb8a

### 기타

- 미확인
  - 커밋: 5f6bb8a

## [0.6.1] - 2026-08-25

### 기능

- 미확인
  - 커밋: 7499a30

### 기타

- 미확인
  - 커밋: 7499a30
- 미확인
  - 영향: 미확인
  - 커밋: 7499a30

## [0.6.0] - 2026-08-24

### 기능

- 미확인
  - 커밋: c398f2e, 2a7d618, 9a17b1b, 58037e6, d680514
- 미확인
  - 커밋: c398f2e, 2a7d618, 9a17b1b, 58037e6, d680514
- 미확인
  - 커밋: c398f2e, 2a7d618, 9a17b1b, 58037e6, d680514
- 미확인
  - 커밋: c398f2e, 2a7d618, 9a17b1b, 58037e6, d680514

### UI

- 미확인
  - 커밋: c398f2e, 2a7d618, 9a17b1b, 58037e6, d680514
- 미확인
  - 커밋: c398f2e, 2a7d618, 9a17b1b, 58037e6, d680514

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: c398f2e, 2a7d618, 9a17b1b, 58037e6, d680514

### 기타

- 미확인
  - 커밋: c398f2e, 2a7d618, 9a17b1b, 58037e6, d680514

## [0.5.2] - 2026-08-23

### 기능

- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f

### UI

- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f

### 기타

- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f
- 미확인
  - 커밋: 57006bf, 377dc3b, 0670388, 82244e1, 69f3ef5, e412cf4, 4c0e365, f475e2c, 72af5f6, f7fcd9d, 6cddd0f

## [0.5.1] - 2026-08-22

### 기타

- 미확인
  - 커밋: e43c747
- 미확인
  - 커밋: e43c747

## [0.5.0] - 2026-08-22

### 기능

- 미확인
  - 커밋: d6ed80f
- 미확인
  - 커밋: d6ed80f
- 미확인
  - 커밋: d6ed80f

## [0.4.1] - 2026-08-21

### 기능

- 미확인
  - 커밋: 33bb6c3

### UI

- 미확인
  - 커밋: 33bb6c3
- 미확인
  - 커밋: 33bb6c3

## [0.4.0] - 2026-08-21

### 기능

- 미확인
  - 커밋: 6c6d189
- 미확인
  - 커밋: 6c6d189
- 미확인
  - 커밋: 6c6d189
- 미확인
  - 커밋: 6c6d189

## [0.3.3] - 2026-08-21

### 기능

- 미확인
  - 커밋: cb3b6a9
- 미확인
  - 커밋: cb3b6a9
- 미확인
  - 커밋: cb3b6a9

### UI

- 미확인
  - 커밋: cb3b6a9

### 수정

- 미확인
  - 커밋: cb3b6a9

### 기타

- 미확인
  - 커밋: cb3b6a9

## [0.3.2] - 2026-08-21

### UI

- 미확인
  - 커밋: 9347219

### 수정

- 미확인
  - 커밋: 9347219

## [0.3.1] - 2026-08-21

### 기능

- 미확인
  - 커밋: 90f966b

### UI

- 미확인
  - 커밋: 90f966b
- 미확인
  - 커밋: 90f966b
- 미확인
  - 커밋: 90f966b

### 밸런스

- 미확인
  - 미확인: 이전 미확인, 이후 미확인
  - 영향: 미확인
  - 커밋: 90f966b

### 수정

- 미확인
  - 커밋: 90f966b

## [0.3.0] - 2026-08-21

### 기능

- 미확인
  - 커밋: ccca36c
- 미확인
  - 커밋: ccca36c
- 미확인
  - 커밋: ccca36c

### UI

- 미확인
  - 커밋: ccca36c
- 미확인
  - 커밋: ccca36c
- 미확인
  - 커밋: ccca36c
- 미확인
  - 커밋: ccca36c

### 기타

- 미확인
  - 커밋: ccca36c

## [0.2.3] - 2026-08-21

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: 5f2b2ac

## [0.2.2] - 2026-08-21

### 수정

- 미확인
  - 커밋: f6e85bc

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: f6e85bc
- 미확인
  - 커밋: f6e85bc

## [0.2.1] - 2026-08-21

### 기타

- 미확인
  - 커밋: 30a03ed

## [0.2.0] - 2026-08-20

### 기능

- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713

### UI

- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713

### 수정

- 미확인
  - 영향: 미확인
  - 커밋: f148713

### 기타

- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713
- 미확인
  - 커밋: f148713

## [0.1.0] - 2026-08-20

### 기능

- 미확인
  - 커밋: 92257ad
- 미확인
  - 커밋: 92257ad
- 미확인
  - 커밋: 92257ad
- 미확인
  - 커밋: 92257ad
- 미확인
  - 커밋: 92257ad
- 미확인
  - 커밋: 92257ad

### 기타

- 미확인
  - 영향: 미확인
  - 커밋: 92257ad

[0.20.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.20.0
[0.19.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.19.3
[0.19.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.19.2
[0.19.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.19.1
[0.19.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.19.0
[0.18.5]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.18.5
[0.18.4]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.18.4
[0.18.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.18.3
[0.18.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.18.2
[0.18.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.18.1
[0.18.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.18.0
[0.17.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.17.1
[0.17.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.17.0
[0.16.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.16.0
[0.15.4]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.15.4
[0.15.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.15.3
[0.15.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.15.2
[0.15.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.15.1
[0.15.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.15.0
[0.14.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.14.1
[0.14.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.14.0
[0.13.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.13.2
[0.13.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.13.1
[0.13.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.13.0
[0.12.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.12.1
[0.12.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.12.0
[0.11.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.11.0
[0.10.5]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.10.5
[0.10.4]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.10.4
[0.10.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.10.3
[0.10.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.10.2
[0.10.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.10.1
[0.10.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.10.0
[0.9.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.9.0
[0.8.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.8.3
[0.8.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.8.2
[0.8.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.8.1
[0.8.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.8.0
[0.7.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.7.2
[0.7.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.7.1
[0.7.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.7.0
[0.6.7]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.6.7
[0.6.6]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.6.6
[0.6.5]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.6.5
[0.6.4]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.6.4
[0.6.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.6.3
[0.6.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.6.2
[0.6.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.6.1
[0.6.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.6.0
[0.5.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.5.2
[0.5.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.5.1
[0.5.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.5.0
[0.4.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.4.1
[0.4.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.4.0
[0.3.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.3.3
[0.3.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.3.2
[0.3.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.3.1
[0.3.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.3.0
[0.2.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.2.3
[0.2.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.2.2
[0.2.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.2.1
[0.2.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.2.0
[0.1.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.1.0
