# 변경 기록

이 파일은 생성된다. 직접 고치지 않는다. 형식은 Keep a Changelog를 따른다.

## [0.21.0] - 2026-11-27

### 기능

- 상단 HUD 이벤트 버튼과 3종 라이브 이벤트(삼총사를 낚아라, 강태공 선수권 대회, 천하제일 행운왕) 서버·클라이언트 계약을 구현했다. 진행 기간 내에만 이벤트 버튼과 목록이 노출되고, 대회 전용 구역 강태공 분지 호수(산타 동산 분위기·이벤트 어종 9종·방치 5배·표준 스펙 낚싯대·강태공 모자 2종·수시 정산)와 이벤트 도감을 제공한다.
  - 라이브 이벤트 창과 HUD 이벤트 버튼, 삼총사를 낚아라·강태공 선수권 대회·천하제일 행운왕 구현: 이전 기간제 라이브 이벤트 목록, 전용 대회 호수, 추첨·수시 정산·누적 운세 경쟁 기능 없음, 이후 진행 창 기준 HUD 버튼·이벤트 창, 3종 이벤트 규칙·도감·모자 보상·순위판·추첨 시드 기록 제공
  - 커밋: 3f37de70, dbc19dd2, 3c4763aa, a9ab1a89, 9c53ee17, b42e161e, d1c74c3e, 35b16a8d, 8dc38b9b, f9b8a167, b9d33b4e, 199cdaf6
- Web Audio 기반 사운드 엔진(soundEngine), 배경음악(고요한 픽셀 항해), 주요 상호작용 효과음(투척·입질·수동 낚싯줄·네임드 결투·구매·강화·보상)을 구현했다. 첫 접속 알림·소리 안내 창, 설정 소리 제어(BGM·SFX 개별 켜기/끄기·음량), 비활성 탭 자동 일시중지를 연결했다.
  - 배경음악·효과음 엔진과 알림·소리 온보딩 및 설정 UI 연결: 이전 게임 내 배경음악과 효과음 출력·설정 UI 부재, 이후 배경음악 1곡과 주요 효과음, 첫 접속 알림과 소리 허용 창, 설정 소리 제어·비활성 탭 일시중지 지원
  - 커밋: 3f37de70, 3b642880, 2f725c9d, d1c74c3e, 35b16a8d, f9b8a167
- 기존 월드(전체)와 길드 2방 실시간 채팅을 전체(global)·지역(local)·길드(guild) 3방으로 분리하고, 통합 피드와 4색상 필터 토글·전체 10초 쿨다운·중복 연타 차단·비포커스이탈 게이지 UX를 도입했다. 공유 계약 src/game/rules/live.ts는 ChatRoom('global' | 'local' | 'guild'), GLOBAL_CHAT_COOLDOWN_MS(10000ms), CHAT_DUPLICATE_WINDOW_MS(10000ms), globalChatCooldown·isDuplicateChat, ClientMessage({ t: 'region' }), ServerMessage({ t: 'localHistory' }, chat-global-cooldown·chat-duplicate 오류)를 추가했다. 서버 api/_server/live.ts는 topZoneOf(zone) ?? region 기준으로 최상위 해역 지역 방을 관리하며 거점 체류나 이동 시 { t: 'region' }에 맞춰 { t: 'localHistory' }를 내려주고, 전체 방 10초 쿨다운과 직전 동일 문구 10초 중복 차단(합산 10초 25건 유지)을 강제한다. DB supabase/migrations/0048_chat_channels_and_notices.sql은 chat_messages에 channel·region 컬럼 및 부분 인덱스를 가산 추가했다. 클라이언트 src/index.css(--c-chat-global/#f0c451, --c-chat-local/#22d3ee, --c-chat-guild/#c08cff, --c-chat-system/#93a8c4), messageFilter.ts(레거시 'chat' 키 → global+local 하위 호환), MessageLog.tsx(왼쪽 2px 채널 색선·상단 전체-지역-길드-시스템 색상 스워치 토글), chatInput.ts·useLive.ts·ChatBar.tsx(기본 발신 local, Tab 순환 전체→지역→길드, 본인 global 에코/거부 확정 기반 10초 카운터·입력창 하단 2px 골드 게이지·포커스 유지·해요체 문구)를 구현했다.
  - 실시간 채팅방 구조 및 지역 방 정규화(live.ts·chat.ts·0048): 이전 room 생략 시 단일 월드 방과 guild 방만 운영(해역/지역 구분 없음), 이후 global/local/guild 3방 분리, 기본 발신 local 및 topZoneOf 기반 최상위 지역 방 격리·localHistory 동기화
  - 전체 채팅 쿨다운 및 동일 문구 반복 제한: 이전 10초당 25건 슬라이딩 윈도우만 적용, 이후 global 방 10초 쿨다운(chat-global-cooldown, retryAfterMs) 및 전 방 공통 직전 트림 문구 10초 반복 차단(chat-duplicate) 추가
  - 메시지 창 글줄·토글 및 입력 줄 대기 UX: 이전 3개 고정폭 토글(채팅/길드/시스템)과 월드↔길드 2방 전환, 대기 게이지 없음, 이후 전체→지역→길드→시스템 컴팩트 색상 스워치 토글, 왼쪽 2px 채널 색선, 포커스 비이탈 미리 쓰기·초 카운터·하단 2px 골드 게이지
  - 영향: 스테이징 및 운영 DB에 0048_chat_channels_and_notices.sql 적용이 필요하며, 0048_chat_channels_and_notices.down.sql로 chat_messages 확장 컬럼·인덱스를 되돌릴 수 있다.
  - 커밋: 75ce309f, ce7c1634, 97a684a7, c334eaf1, 9e8d5f9b, 38e8d28a
- 명성과 네임드 토벌 순위에 매주 월요일 KST 04:00 기준 주간 랭킹을 기본값으로 도입하고, 상위 50위 안·밖 모두 하단 고정 내 순위 바를 동일 레이아웃으로 통일했다. supabase/migrations/0050_ranking_weekly_fame.sql(및 .down.sql)로 서버 전용 RLS 테이블 public.ranking_weekly_fame(week_start, user_id, fame_gained, reached_at, updated_at)와 bounty_clears_kind_cleared_at_idx 부분 인덱스를 추가하고, src/game/rules/time.ts에 주간 시작 시각 계산을 더했다. api/action.ts는 게임플레이 명성 증가분만 비보관 방식으로 ranking_weekly_fame에 누적하며(import·debug·claimRelief 제외), api/rank.ts와 api/_data/rank.ts는 window=weekly|all(명성·네임드 토벌 기본 weekly, 도감 3종·어종 크기 all 고정)을 지원한다. 클라이언트 src/features/ranking(ranking.ts·useRanking.ts)·src/platform/adapters/ranking.ts·RankingModal.tsx·RankList.tsx는 상단 1줄 기간 토글(이번 주·전체 누적) 및 초기화 시각/누적 고정 안내, 하단 고정 내 순위 바 상시 동일 위치 노출을 구현했다.
  - 주간 명성·네임드 토벌 집계 및 API 질의(0050_ranking_weekly_fame.sql·api/rank.ts·api/action.ts): 이전 모든 보드가 전체 누적 순위만 제공(window 파라미터 없음), 이후 매주 월요일 KST 04:00 기준 주간 명성(비게임플레이 제외) 및 네임드 토벌 집계, GET /api/rank?window=weekly|all(명성·네임드 토벌 기본 weekly, 도감·어종 크기 all 고정)
  - 랭킹 창 기간 토글 및 하단 내 순위 바(RankingModal·RankList): 이전 기간 토글 부재 및 상위 50위 밖일 때만 하단 내 순위 표시, 이후 상단 기간 전환·초기화 안내(도감 3종은 전체 누적 고정 안내) 및 상위 50위 안·밖 구분 없는 하단 고정 내 순위 바 통일
  - 영향: 운영·스테이징 DB에 0050_ranking_weekly_fame.sql 선적용(v0.21.0 전체 배포 시 0050+0051+0052 일괄 선적용)이 필요하며 순수 가산 마이그레이션이라 구 코드와 공존한다. 되돌리려면 0050_ranking_weekly_fame.down.sql로 신규 테이블과 인덱스를 제거하고 window 분기를 이전 누적 조회로 복구한다.
  - 커밋: 212ca7ba
- 활성화 시작·마감 시각에 맞춰 실시간으로 노출·전환되는 상시 운영 공지 기능을 추가했다. 서버 api/_data/notices.ts listLiveNotices는 마감 전 공지(최대 20건)와 최근 마감된 공지(최대 20건, 합산 상한 MAX_NOTICES = 40)를 함께 조회해 api/_server/live.ts sendToAll(게스트 포함 전체 전송)과 livePresence.ts notifyAll 브릿지로 접속 hello 및 관리자 변경 시({ t: 'notices', notices }) 전파한다. 클라이언트 features/live/model/notice.ts 및 service/useNotices.ts는 startsAt <= now < endsAt 범위의 현재 공지와 마감된 지난 공지를 구분하고(예약 공지는 시작 전까지 모든 화면·탭 비노출) 다음 경계 시각에 단일 타이머로 자동 전환하며, noticesSynced === true가 된 뒤에만 localStorage('pf-dismissed-notices') 닫힘 ID를 정리·저장한다. 화면에서는 GameStageLayout 직계 자식 NoticeStack.tsx(--z-toast, 1/N 겹침 카드, 단일 닫기 버튼)와 MessageLog 상단 공지 띠(우측 별도 [공지] 버튼 제거, 좌측 공지 배지 → megaphone 픽셀 아이콘 → 제목 1줄 말줄임 순서의 컨테이너 전체 단일 버튼), 고정 크기 NoticeModal.tsx(md height={520}, 모바일 고정 높이, 현재 공지·지난 공지 인라인 서브탭, Asia/Seoul 한국 시간 기간 표기, 빈 상태 3분기)를 연결했다.
  - 실시간 기간제 공지 전달 범위 및 클라이언트 노출(listLiveNotices·NoticeStack): 이전 실시간 운영 공지 저장소·전파 경로 및 상단/채팅 공지 UI 부재(초기 구현은 마감 전 공지만 단일 목록으로 노출), 이후 listLiveNotices(마감 전 20건 + 최근 마감 20건, MAX_NOTICES = 40) 전달, 예약 공지 비노출 유지, 현재 공지만 상단 겹침 카드(--z-toast, 한 겹씩 닫기)로 노출 및 마감 경계 자동 전환
  - 채팅 공지 띠 단일 버튼화 및 공지사항 서브탭 창(GameView·NoticeModal·PixelIcon): 이전 공지 띠 우측 별도 공지 버튼과 좁은 단일 목록 공지사항 창, 이후 공지 배지 → megaphone 아이콘 → 제목 1줄 말줄임의 전체 단일 버튼 공지 띠, md height={520}/모바일 고정 높이 NoticeModal에 현재·지난 공지 서브탭, Asia/Seoul 기간 표기 및 빈 상태 3분기 적용
  - 커밋: 75ce309f, ce7c1634, 97a684a7, c334eaf1, 9e8d5f9b, 38e8d28a, e7676a43, 014e1fe9, 195dcbf7, 46a9583e
- 게스트가 구글 계정을 처음 연결해 정식 계정으로 승격될 때 환영 소모품 3종(골드 0G, 작은 바다 영약 1개·생선 탈리 1개·용연향 미끼 3개)을 우편함으로 1회 지급하고, 포구 출항 전환 창과 설정 계정 관리 창에서 보상 안내를 분리·표시하도록 구현했다. src/game/content/firstLinkReward.ts에 FIRST_LINK_REWARD_KEY('google-first-link-reward'), FIRST_LINK_REWARD_ITEMS, FIRST_LINK_REWARD_MAIL(제목 '출항 연결 선물') 단일 정본을 두고, supabase/migrations/0047_mail_idempotency_key.sql과 api/_db/schema.ts에 public.mails.idempotency_key 컬럼 및 부분 유니크 인덱스 mails_user_idempotency_idx((user_id, idempotency_key) WHERE idempotency_key IS NOT NULL)를 추가했다. api/_data/mailbox.ts sendIdempotentMail은 on conflict do nothing으로 중복 발송을 차단하며, api/_auth/googleLink.ts finishLink는 최초 게스트 승격(wasAnonymous)일 때만 onGuestLinked를 호출하고 api/_auth/session.ts appAuth는 우편 발송 실패를 try/catch와 reportServerIssue로 격리해 구글 연결·승격 성공 흐름을 보존한다(기존 구글 계정 전환·기연결 계정 제외). 화면에서는 src/features/account/model/firstLinkReward.ts selectFirstLinkRewardItems가 요약·툴팁 뷰 모델을 만들고, src/presentation/ui/Modal.tsx stage 레이어의 aside 슬롯(@min-[960px] 폭 우측 바깥 배치)을 통해 src/presentation/views/overlays/account/AccountModal.tsx 출항 연결 창(mode="connect") 본문은 화면 정중앙에 고정하며 최초 연결 선물 목록(카드 호버 시 지속·효과 툴팁)을 두고, 기존 항로·교류·보존 안내는 우측 닫기 가능 애드온 패널('연결하면 열리는 것')로 분리했다. 설정 계정 관리 창(mode="manage") 게스트 상태에서는 ItemBadge 미니 칩으로 선물을 보여 준다.
  - 최초 구글 연결 환영 우편 보상 및 멱등 키(FIRST_LINK_REWARD_ITEMS·mails.idempotency_key): 이전 게스트 최초 구글 연결 시 환영 우편 보상 및 우편함 멱등 키·부분 유니크 인덱스 부재, 이후 최초 게스트→구글 승격 시 골드 0G와 작은 바다 영약 1개·생선 탈리 1개·용연향 미끼 3개를 google-first-link-reward 멱등 키와 mails_user_idempotency_idx로 1회 지급(실패 시 연결 성공 격리)
  - 포구 출항 전환 창 및 계정 관리 창 보상·혜택 안내 배치(AccountModal·Modal aside): 이전 출항 전환 창 본문에 항로·교류·보존 안내만 두고 선물 안내 부재, Modal stage aside 슬롯 없음, 이후 출항 전환 창 본문 중앙 고정 및 최초 연결 선물 구획(요약 1줄·호버 툴팁) 배치, 항로·교류·보존은 @min-[960px] 우측 닫기 가능 애드온 패널로 분리, 설정 계정 관리 창 게스트 상태에 미니 칩 추가
  - 영향: 운영 DB에 supabase/migrations/0047_mail_idempotency_key.sql 마이그레이션 적용이 필요하며, 0047_mail_idempotency_key.down.sql로 인덱스·컬럼을 제거하거나 onGuestLinked 연결을 빼서 보상 발송을 중단할 수 있다. 우편 발송 오류는 격리되어 구글 계정 연결 자체는 실패하지 않는다.
  - 커밋: f0854110, e59ed774, 1b62a615, e7adf541, f1be4a86, da542068, 90f28b92, 776fc85c, 02f954bd, d4ed1df0, 6f88302a
- 수배판과 의뢰 정보 창에서 일반 의뢰·네임드 카드의 대상 구역·해역 표기를 통일하고, 위치와 무관하게 미완료 수주 의뢰를 포기할 수 있는 abandonQuest 흐름을 추가했다. src/game/rules/actionSchema.ts·actions.ts(ACTION_TYPE_MAP·abandonQuest 리듀서)·rules.ts(canAbandonQuest)에 포기 계약을 신설해 완료 조건을 채운 대기 의뢰 포기는 거부한다. api/action.ts와 api/_data/bounty.ts는 포기 확정 시 해당 의뢰의 bounty_progress·bounty_tickets만 삭제하고 namedPity.wounds와 일일 bounty_clears는 보존한다. 클라이언트에서는 src/features/bounty/model/abandon.ts·panel.ts·questInfo.ts와 BountyPanel·QuestInfoModal·QuestInfoWindow·BountyCard·NamedCard·QuestInfoCards가 대상 구역/해역 통일 표기(구역 전체 또는 구역 (해역)), 미완료 의뢰 포기 버튼과 도전권 소멸 경고 확인 창(abandonQuest.ts), 완료 대기 포기 비노출을 반영했고, 후속 수정(GameView.tsx)으로 스테이지 확인 창이 부모 모달 위에 표시되도록 렌더 순서를 정정했다.
  - 일반 의뢰·네임드 대상 구역/해역 표기(panel.ts·questInfo.ts·BountyCard·NamedCard): 이전 일반 의뢰 카드에 대상 구역·해역 표기가 없고 네임드 카드의 나타나는 곳 형식과 불일치, 이후 수배판과 의뢰 창 양쪽에서 구역 전체 또는 구역 (출몰 해역) 형식으로 통일 표기
  - 미완료 수주 의뢰 포기 액션 및 확인 창 렌더 순서(abandonQuest·api/_data/bounty.ts·QuestInfoModal·GameView): 이전 수주한 의뢰 포기 기능·abandonQuest 액션 부재 및 스테이지 확인 창이 부모 모달 아래에 렌더되는 순서 문제, 이후 마을·바다·항구 무관 미완료 의뢰 포기 허용(완료 대기는 거부), bounty_progress·bounty_tickets 삭제·도전권 소멸 경고(namedPity.wounds·bounty_clears 유지) 및 스테이지 확인 창 최상단 렌더 순서 정정
  - 커밋: 137783f1, 0523a581
- 콤팩트 산타모자(santa-hat)를 이벤트 한정 모자로 추가하고, 우편 모자 첨부·겨울 기간 첫 boot 1회 멱등 자동 우편 선물·강태공 분지 호수 강제 착용 덮어쓰기를 구현했다. src/game/content/wardrobe.ts에 santa-hat(#c62828 본체·#eceff1 털테두리·방울, source: event)과 forcedHatForRegion(championship -> santa-hat)을 추가하고, supabase/migrations/0051_mail_hats.sql(및 .down.sql)로 public.mails.hats jsonb 컬럼을 신설했다. api/_data/mailbox.ts와 src/game/rules/actions.ts claimMail·api/action.ts는 우편 모자 첨부 저장·조회·수령(보유 중복 시 멱등)을 지원하며, 겨울 선물 기간 활성 시 첫 boot 요청마다 게스트·구글 연결 계정 모두에게 멱등 키(santa-hat-2026-gift)로 산타모자 선물을 1회 자동 발송한다. 또한 api/_server/live.ts·region.ts·actors.ts·Field.tsx·WardrobePanel.tsx는 강태공 분지 호수 체류 중 세이브의 look·hats를 변경하지 않고 표시 외형과 실시간 Presence 모자만 santa-hat으로 덮어쓰고 퇴장 시 복원한다.
  - 우편 모자 첨부 지원 및 겨울 선물 첫 boot 1회 자동 발송(0051_mail_hats.sql·mailbox.ts·action.ts): 이전 public.mails가 골드·아이템 첨부만 지원하고 이벤트 모자 자동 선물 없음, 이후 mails.hats(jsonb) 추가, claimMail 모자 수령 멱등 처리 및 활성 기간 첫 boot 시 santa-hat-2026-gift 1회 우편 선물
  - 산타모자 추가 및 강태공 분지 호수 강제 착용 덮어쓰기(wardrobe.ts·live.ts·region.ts): 이전 산타모자 정의 및 구역별 강제 모자 덮어쓰기 규칙 부재, 이후 santa-hat(콤팩트 규격) 추가 및 championship 구역 체류 중 세이브 불변 표시·Presence 산타모자 덮어쓰기 적용
  - 영향: 운영·스테이징 DB에 0051_mail_hats.sql 선적용(v0.21.0 전체 배포 시 0050+0051+0052 일괄 선적용)이 필요하며 순수 가산 컬럼이다. SANTA_HAT_GIFT_ENABLED=0(또는 false)으로 자동 선물 발송을 즉시 중단할 수 있고, 0051_mail_hats.down.sql로 mails.hats 컬럼을 되돌릴 수 있다.
  - 커밋: 5082b385

### UI

- 서버 확정 캐치 시 동일 구역 다른 플레이어에게 어군 수면 튀어오르기 연출을 실시간 전파하고, CatchCard의 공전/방사 스파크 오버레이를 제거해 등급·돌연변이 카드 연출을 분리 개편했다. src/game/rules/live.ts ServerMessage에 { t: 'catchFx'; uid; region; x; y; toX?; toY?; fishId; form? }를 추가하고 api/action.ts·api/_server/live.ts·livePresence.ts가 확정 캐치 직후 전 어종 대상으로 동일 구역 타인에게 1회 브로드캐스트한다(게스트 제외). 클라이언트 useLive.ts·fieldEngine.ts·region.ts·overlays.ts·schoolView.ts는 어군 출발 좌표에서 원래 스프라이트 크기(scale: 1)의 물고기가 이륙 물보라와 함께 0.9s 동안 포물선으로 낚은 사람 위치(toX, toY)까지 날아가며(착수 물보라 없음, 목표 좌표 없을 때 제자리 폴백 시에만 착수 물보라) 영웅·전설 등급일 때만 지난 궤적을 따라 꼬리 스파클이 뒤따르고 돌연변이 전용 수면·공중 스파클은 띄우지 않도록 구현했으며 뷰포트 컬링·동시 건수 상한을 적용했다. CatchCard.tsx와 src/index.css는 340×160 고정 크기를 유지하고 이름·수치를 가리던 96px 공전/방사 스파크 오버레이를 제거했으며, 영웅·전설 등급에만 10×10px 2px 모서리 L-브래킷과 초상화 액자 발광을, 전설 등급 한정으로 카드 외곽 테두리 맥동 글로우와 내부 대각선 빛줄기 쉬머를 추가하고, 돌연변이 폼은 모서리 강조·액자 발광 없이 기존 카드 내부 자홍 잔광(8개 피어오름)·이름 쉬머·로어 1줄 문구만 유지하도록 정정했다.
  - 실시간 어군 포물선 튀어오르기 전파 및 꼬리 스파클(live.ts·action.ts·region.ts·overlays.ts): 이전 포획 어군 연출이 본인 화면에서만 작게 재생되고 타인에게 공유되지 않음(초기 개선은 제자리 2배 확대 및 돌연변이 스파클 포함), 이후 서버 확정 캐치 시 { t: 'catchFx' }(toX/toY 포함) 1회 브로드캐스트(게스트 제외), scale: 1 물고기가 이륙 물보라와 함께 포물선 이동, 영웅·전설만 궤적 꼬리 스파클 적용(돌연변이 수면·공중 스파클 제거) 및 뷰포트 컬링·동시 상한 적용
  - 잡기 결과 카드(CatchCard) 등급·돌연변이 연출 분리(CatchCard.tsx·index.css): 이전 전설 카드에 96px 공전/방사 스파크 오버레이가 이름·수치를 가림(초기 개편은 돌연변이에도 모서리·액자 발광 적용), 이후 340×160 고정·공전/방사 스파크 제거, 영웅·전설에만 10×10px 2px 모서리 L-브래킷·액자 발광 및 전설 한정 외곽 맥동·대각 빛줄기 추가, 돌연변이는 카드 내부 자홍 잔광·이름 쉬머·1줄 로어만 유지
  - 커밋: 3234e32a, 32f8d7a0
- 개별 컴포넌트의 직접 keydown 리스너 우회를 제거하고 단일 키 스코프 계층 스택(HOTKEY_TIER)으로 ESC 닫기와 거점 즉시 이동을 통합했다. src/presentation/ui/hotkeys.ts에 BLOCKER(60) → POPOVER(50) → APP_CONFIRM(45) → APP_MODAL(40) → SIDEBAR_SHEET(30) → STAGE_CONFIRM(25) → STAGE_MODAL(20) → BASE(10) 우선순위 계층과 exclusive 차단, 키 누름 유지(e.repeat) 무시, 입력 포커스 보호를 정리했다. GameMenu.tsx의 직접 window 리스너를 스코프로 통합하고 Modal·Popover·Tip·ConfirmDialog·InputDialog·NoticeDialog·sidebar·EncounterModal·FerryVeil·GameView·BaseMenu·MenuCard를 연동해, 닫기 불가(closable=false) 창·여객선 이동 연출·네임드 조우(결투)·입력 포커스 중에는 하위 ESC 전파와 거점 나가기를 차단하며 열린 UI가 없을 때만 집→마을, 항구→바다로 즉시 이동한다. PC 거점 나가기 카드(문·승선)에는 <kbd> [ESC] 힌트를 추가했다.
  - 단일 키 스코프 ESC 우선순위 스택 및 차단 가드(hotkeys.ts·GameMenu·Modal·FerryVeil·EncounterModal): 이전 GameMenu 등 직접 리스너 혼재, e.repeat 방어·거점 ESC 나가기 미지원 및 일부 창 차단 경합, 이후 HOTKEY_TIER(10\~60) 단일 스택 통합, e.repeat 무시, closable=false·여객선 이동·결투·입력 포커스 차단 적용
  - 거점 ESC 즉시 출항 및 PC 카드 [ESC] 키캡 힌트(BaseMenu·MenuCard·GameView): 이전 거점 화면에서 ESC로 마을·바다 이동 불가, 이후 열린 UI·차단 없을 때 집→마을, 항구→바다 즉시 이동 및 PC 나가기 카드 <kbd> [ESC] 힌트 표시(모바일 미표시)
  - 커밋: 8f30b17c
- 도감(일반·돌연변이), 가방 카드뷰, 지역 탭 어군 정보 3화면 모두에서 발견 및 미발견(???) 밤 전용 어종 카드 우측 상단에 달 픽셀 아이콘을 표시하도록 복구했다. src/presentation/ui/fish/NightMark.tsx는 fish.night일 때 발견 카드는 선명한 하늘 강조색(text-accent), 미발견(???) 카드는 어두운 톤 다운 색(text-text-dim)으로 PixelIcon glyph="moon"을 렌더링하고 호버·포커스·누르기 공용 툴팁(밤 전용 출현 시각 및 달빛 미끼 안내)과 각 화면 소제목·도구 줄의 단독 ? 범례 툴팁(NightLegend)을 제공한다. DexGrid.tsx(일반·돌연변이), BagCards.tsx, VRegion.tsx에 일관 적용하고 nightMark.test.tsx·BagTab.test.tsx·VRegion.test.tsx에서 돌연변이 격자와 미발견(???) 표식·범례를 검증한다.
  - 밤 전용 어종 달 아이콘 노출 범위 및 미발견·지역 탭 표기(NightMark·DexGrid·BagCards·VRegion): 이전 도감과 가방 카드뷰의 발견된 밤 전용 어종에만 표시하고 미발견(???) 및 지역 탭 어군 정보에서는 미표시, 이후 도감(일반·돌연변이)·가방 카드뷰·지역 탭 어군 정보 3화면 모두에서 발견(선명한 하늘 강조색) 및 미발견 ???(톤 다운 색) 밤 어종 카드 우측 상단에 달 아이콘과 툴팁·? 범례 표시
  - 공용 카드 클래스 RARITY_CARD: 이전 'pf-notch bg-(--inset-base) ...'(위치 기준 없음), 이후 'relative pf-notch bg-(--inset-base) ...'(표식 absolute 배치 기준)
  - 커밋: d6c85d60, cbd4bba7, 3a349f95, 16137f67
- 브라우저 알림 선호의 기본값을 켜짐으로 바꾸고, 첫 진입 안내 카드와 설정 탭의 권한 상태 표현을 추가했다. src/platform/adapters/attention.ts는 pf-encounter-alert·pf-bag-full-alert·pf-update-alert의 저장값이 없으면 켜짐으로 해석하고 명시적 off만 꺼짐으로 유지하며, pf-update-alert가 없으면 이전 한 스위치 체계의 pf-encounter-alert 값을 이어받는다. src/features/alerts/model/alerts.ts는 세 알림 순서와 문구, 권한 상태 라벨·차단 안내, 카드 표시와 가방 가득 참 알림 판정을 모으고, src/features/alerts/service/alertPrompt.ts는 권한이 default이고 안내 카드를 본 적이 없으며 끈 알림이 없는 플레이어에게 다른 첫 접속 창이 닫힌 뒤 카드를 한 번 연다. 카드의 허용 버튼과 설정·수배판의 토글 클릭 안에서만 Notification 권한을 요청하며 페이지 로드나 카드 판정 시점에는 요청하지 않는다. src/features/alerts/service/bagFullAlert.ts는 탭이 숨겨진 동안 가방이 가득 찰 때 한 번만 알리고 화면으로 돌아오면 다시 알릴 수 있게 초기화한다. src/presentation/views/overlays/alerts/AlertPromptModal.tsx와 SettingsModal.tsx, BountyPanel.tsx가 카드·설정 권한 줄·수배판 체크를 연결하고, 후속 수정 1129ce24는 화면 계층이 알림 타입을 features/alerts/model을 통해 가져오게 해 platform/api 직접 참조 경계 위반을 제거했다. 탭 제목 깜빡임은 권한이 없거나 브라우저가 미지원일 때도 유지한다.
  - 브라우저 알림 선호 기본값과 저장 키: 이전 pf-encounter-alert·pf-update-alert가 on일 때만 켜짐으로 판정해 초기값 null은 꺼짐, 가방 가득 참 알림 없음, 이후 세 알림 모두 키가 없으면 켜짐으로 보고 명시적 off만 존중, pf-update-alert가 없으면 pf-encounter-alert 값을 이어받음
  - 첫 진입 안내 카드와 권한 요청 시점: 이전 설정 또는 수배판 토글을 직접 누를 때만 권한 요청, 이후 권한 default·미열람·off 없음 조건에서 다른 첫 접속 창 뒤 안내 카드 1회 표시, 허용 버튼 클릭 안에서만 권한 요청하며 나중에와 닫기는 세 알림을 끔
  - OS 알림 종류와 폴백: 이전 네임드 조우와 업데이트 안내 2종만 시스템 알림 사용, 이후 네임드 조우·가방 가득 참·업데이트 3종으로 확장하고, 권한 없음·미지원이어도 탭 제목 깜빡임 폴백 유지
  - 설정 탭 권한 상태와 계층 경계: 이전 브라우저 권한 상태를 한눈에 보는 줄이 없고 화면 계층이 platform/api/attention 타입을 직접 참조, 이후 설정 탭에 권한 상태 줄과 허용 버튼·차단 안내를 두고, 알림 타입은 features/alerts/model을 통해 가져옴
  - 커밋: f9d626d3, 1386ac28, 1129ce24, bc90b5e2

### 밸런스

- 게스트와 초기 선박 단계 플레이어도 시작 쿠폰·우편 등으로 얻은 도시락·미끼·비약을 바로 소비할 수 있도록 소비 아이템 사용 해금을 제작 해금과 분리하고 잠금 문구를 통일했다. src/game/rules/guest.ts guestActionVerdict OPEN 허용 목록에 eat·usePotion을 추가하고, src/game/rules/cooking.ts canEat와 src/game/rules/rules.ts canUsePotion에서 게스트·배 단계 제한을 제거해 보유 수량(>= 1)과 기존 사용 조건만 확인하도록 변경했다(cook·cancelCook·extractEnergy·transmuteEnergy의 정식 계정 + 인도양 5단계 해금은 유지). src/features/kitchen/model/bagItems.ts·slots.ts, src/presentation/views/game/tabs/bag/ItemSection.tsx·ItemDetail.tsx는 보유 도시락·미끼와 미보유 포함 비약의 게스트·선박 잠금을 제거했으며, HUD 보너스 통합 칩(SlotChips.tsx)과 가방 요리 잠금 안내를 제작 해금 기준('인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.')으로 통일했다.
  - 게스트·전 배 단계 보유 소비 아이템(eat·usePotion) 사용 허용(guest.ts·canEat·canUsePotion): 이전 게스트의 도시락·미끼·비약 사용을 account-only로 차단하고(1차 분리는 정식 계정 eat만 허용), 미보유 비약 카드·상세 창도 게스트 잠금 처리, 이후 guestActionVerdict OPEN에 eat·usePotion을 포함하고 canEat·canUsePotion 게스트·배 단계 제한을 제거해 게스트·모든 배 단계에서 보유 소모품 즉시 사용 허용
  - 가방 아이템 탭·상세 창·HUD 보너스 통합 칩 잠금 안내 통일(bagItems.ts·slots.ts·ItemSection·ItemDetail·SlotChips): 이전 비약 게스트 잠금(potionLock) 및 보유 여부에 따른 분기 잠금과 '부엌을 쓸 수 있어요.' 안내 사용, 이후 비약 잠금 제거 및 보유·활성 도시락·미끼 잠금 해제, 제작·기운 잠금과 HUD 안내를 '인도양 항로가 열리면 부엌에서 도시락과 미끼를 만들 수 있어요.'로 통일
  - 영향: 게스트와 배 5단계 미만 플레이어가 시작 쿠폰·우편·이벤트 등으로 얻은 도시락·미끼·비약을 즉시 사용할 수 있다. 요리 제작과 기운 추출·변환의 정식 계정 및 인도양 5단계 제한은 그대로 유지되며, guestActionVerdict·canEat·canUsePotion·bagItems 잠금 규칙을 되돌려 복구할 수 있다.
  - 커밋: f0854110, e59ed774, 1b62a615, 1ade036f, 67c3d3bf, de5f0594, 7dae61fd

### 수정

- 게스트→기존 구글 계정 전환 비폴백 오류 안내와 실시간 이벤트 동기화·조회 실패 재시도를 일괄 보강했다. adapters/auth.ts와 features/account(useGoogleReturn·sailReturn·GoogleOverwriteDialog)는 1회 전환 티켓의 rate_limited·switch_session_mismatch·네트워크/5xx 비폴백 실패 시 2차 로그인 폴백 대신 처리 중 잠금 해제·출처 복귀 및 오류 유형별 전용 안내 문구를 표시하게 고쳤다. 실시간 동기화에서는 본인 연결 포함 nick 전파·useLiveNickSync, 우편 발송 시 { t: 'mail' } 푸시·useMailAlerts, 친구 삭제·거절·취소 시 { t: 'friend', kind: 'updated' } 상대 알림·useFriendAlerts, 길드 위임·설정·강퇴·신청 취소 실시간 갱신을 연결하고, FriendsModal·BlockList·GuildModal·GuildInviteDialog·MailboxModal·RankingModal·DexDetail/PlayerInfo 7종 오버레이에 조회 실패 재시도 버튼을 추가했다.
  - 구글 계정 전환 확인 비폴백 오류 처리 및 처리 중 잠금(confirmGoogleSwitch·useGoogleReturn·GoogleOverwriteDialog): 이전 1회 전환 티켓 확인에서 비폴백 오류 코드 구분 없이 안내 누락 및 처리 중 모달 닫힘 허용, 이후 rate_limited·switch_session_mismatch 등 비폴백 오류 전용 문구 출력, 처리 중 모달 잠금 및 출처(출항/설정) 복귀 정리
  - 닉네임·우편·친구·길드 실시간 이벤트 동기화 및 오버레이 7종 실패 재시도 UI: 이전 본인 소켓 nick·우편·친구 삭제·길드 위임/강퇴/취소 실시간 갱신 누락 및 일부 창 조회 실패 재시도 버튼 부재, 이후 실시간 이벤트 전파·무효화 훅(useLiveNickSync·useMailAlerts·useFriendAlerts)과 7종 오버레이 다시 시도 버튼 연결
  - 커밋: f1be4a86, da542068, d788a2a1, a022638c, 6180475c, b694151d, 48226f0c, 3cb9f1cc

## [0.20.5] - 2026-11-26

### 기능

- 스테이지 메뉴에 운세 항목을 추가해 오늘의 운세를 언제든 다시 볼 수 있게 하고, 로그인 계정 전용 public.daily_fortunes(0042_daily_fortunes.sql, 0046_expand_daily_fortunes.sql) 적재·확장과 21종 운세(12종 kind, 내부 비노출 3등급 65/25/10 확률, 10개 보너스 채널 독립 곱연산) 및 GET /api/fortune/history?month=YYYY-MM 월별 달력·전체 이력 discovered 집계를 구현했다. FortuneCalendarModal에 달력|점괘첩 SubTabs(3열×7행 21종 무스크롤·게스트 잠금)를 배치하고 StatsModal 10채널·EnergyPanel·SaleWindow·DevTools fortune.set 명령을 연동했다.
  - 스테이지 메뉴 운세 진입 및 월간 운세 이력·점괘첩 저장·조회(0042·0046·api/fortune·FortuneCalendarModal): 이전 첫 접속 팝업 이후 당일 운세 재열람 경로와 과거 일별 운세 이력·수집 조회 부재(3종 kind), 이후 메뉴 운세 창(달력|점괘첩 SubTabs, 3×7 21종 무스크롤, 게스트 잠금), public.daily_fortunes(0042·0046 12종 kind·3등급 index=5) 영구 적재 및 GET /api/fortune/history 월별 달력·discovered 집계 추가
  - 오늘의 운세 21종 확장·내부 3등급 확률 및 10개 효과 채널 연동(fortune·effects·logic·cooking·actions·StatsModal·DevTools): 이전 3종(물고기·골드·그림자) 6개 점괘만 추첨·적용, 이후 12종 kind·21종 점괘(1등급 65%·2등급 25%·3등급 희귀 대길 10%), 10개 효과 채널(어획·판매·입질 대기·월척·명성·네임드·돌연변이·밤 어종·기운·전설) 독립 곱연산 및 개발 도구 fortune.set 지원
  - 영향: 0042_daily_fortunes.sql 및 0046_expand_daily_fortunes.sql 마이그레이션 적용이 필요하며(0046 down SQL로 제약 복구 가능), 로그인 계정의 당일 운세 이력은 마이그레이션 적용 이후부터 기록된다.
  - 커밋: c77b98d0, 36c767ad, b83e5cab, 88760e25, c82a2a8c, cf355110, ba5f3c47, 74dc3d6e, 3ba03fdc, 6d95d582, 1d24282a, 6830f3c2, 089e8f94
- 범용 스택 아이템 카탈로그(itemCatalog.ts), 비약 정의(potions.ts, 첫 항목 luck-small: 게임 하루 동안 희귀 이상 출현 비중·판매가·네임드 조우 +0.05/×1.05, 당일 중복 사용 거부, 로그인 계정 전용·배 단계 무관 사용) 및 우편 아이템 첨부 수령(claimMail, GameState.items 스택 반영, MailboxModal ItemBadge 표시)을 추가했다.
  - 비약 아이템 카탈로그·가방 묶음 및 우편 첨부 아이템 수령: 이전 범용 스택 아이템·비약 체계 및 우편 아이템 첨부·수령 불가(골드만 수령), 이후 itemCatalog·potions(luck-small: 게임 하루 KST 04:00 경계까지 행운 대상 +5%p→이후 ×1.05 표기 통일), 로그인 계정 가방 비약 묶음 즉시 사용(당일 중복 거부) 및 우편 아이템 첨부 수령 추가
  - 커밋: bcddd64b, 2e7137e7, 2ef69a0f
- 도시락 레시피에 등급별 제작 시간(일반 가루디야 0초 즉시, 희귀 민 몰리 3분, 영웅 생선 비리야니·암불 티얄 5분, 전설 생선 탈리 10분)과 고유 id 기반 멀티 조리 대기열(cookingQueue), 미완성분 100% 기운 환급 취소(cancelCook), 부엌 3번째 탭 기운 변환(transmuteEnergy: 일반→희귀→영웅→전설 정방향 10:1 비율)을 구현했다.
  - 도시락 제작 시간 및 조리 대기열·취소(cooking·actions·KitchenPanel): 이전 도시락 1개 단일 슬롯 15분 고정 조리 및 취소 불가, 이후 일반 즉시·희귀 3분·영웅 5분·전설 10분 차등, 보관함 10칸 한도 내 멀티 대기열 및 cancelCook 100% 기운 환급 취소 지원
  - 부엌 기운 변환 탭 및 정방향 변환 규칙(transmuteEnergy): 이전 하위 생명의 기운을 상위 등급으로 변환하는 기능 부재, 이후 부엌 3번째 탭 기운 변환 추가, 일반→희귀→영웅→전설 정방향 10:1 변환 지원
  - 커밋: e0a6d5b8, 520f6822, a7908869
- 랭킹 서버(api/_data/rank.ts, api/rank.ts)와 RankingModal을 5종 보드(명성, 도감(일반), 도감(돌연변이), 도감(네임드), 네임드 토벌)로 확장하고 일반 도감 집계에서 네임드를 분리해 지연 조회·캐싱하도록 구현했다.
  - 랭킹 보드 종류 및 탭 구성(api/rank·RankingModal): 이전 명성 및 네임드 포함 통합 도감 위주 구성, 이후 명성·도감(일반)·도감(돌연변이)·도감(네임드)·네임드 토벌 5탭 분리 및 탭 전환 지연 조회 지원
  - 커밋: f1f70e46, bc05b881

### UI

- 업적 카탈로그·보너스 채널·업적 창·스탯 보너스 탭을 전면 개편했다. content/achievements.ts와 rules/achievements.ts·effects.ts·cooking.ts·actions.ts에서 기본 카운터에 energy.spent와 catch.lunch를 추가(5종→7종)하고, 누적 보너스 계열을 26종에서 37종(전역 11·구역 6×3=18·개별 유물 증폭 8)으로 확장하며 밤 어종 출현 비중(nightWeight)·가방 용량(bagCap)·기운 획득량(energyYield)·미끼 증폭(baitAmplify)·도시락 증폭(lunchAmplify) 채널과 밤 항해 감속 곱연산 전환, 15해역 진행 업적 골드 보상 4배 상향(총 103,451,480G)을 반영했다. 월척 장부는 4단계 묶음 카드(big-10/25/50/100-hat)로 정비하고 신규 모자 2종(눈금 띠 챙모자·쇠바늘 낚시 모자)과 절차 픽셀 렌더링을 추가했다. AchievementsModal.tsx는 4탭(진행·전체 누적·구역과 유물·치장)과 미완료만 보기 필터·3열 단계 카드로 재구성했고, stats.ts·BonusTab.tsx는 동일 효과 단위 2열 표(받는 효과 | 적용)와 출처·배수 분해 고정 정렬 툴팁([업적]→[유물]→[길드]→[운세]→[비약]→[도시락]→[미끼]→최종 적용)으로 통합했다.
  - 업적 창 4탭, 미완료만 보기 필터 및 월척 장부 4단계 묶음·신규 모자 2종: 이전 업적 창 3탭(진행·누적 보너스·치장), 월척 50/100 분리 및 진행 골드 25,862,870G, 이후 4탭(진행·전체 누적·구역과 유물·치장), 미완료 필터, 월척 10/25/50/100 묶음(눈금 띠 챙모자·쇠바늘 낚시 모자 추가), 진행 골드 4배(103,451,480G)
  - 누적 보너스 37종 재편(기운 소모·도시락 방치·밤 전설·유물 증폭) 및 스탯 보너스 2열 표: 이전 누적 보너스 26종(5카운터), 보너스 탭 2열(받는 효과·출처) 개별 행 나열 및 밤 감속 기본속도 기준, 이후 누적 보너스 37종(7카운터, 밤 전설·가방·기운·미끼/도시락 증폭·유물 8종), 밤 감속 곱연산, 보너스 2열 통합 표(받는 효과·적용) 및 [출처] 툴팁 분해
  - 커밋: 0ef6e047, 6d615b1b, 8a1d02c9, 77122a3c, 4e736225, 18558e8c, 8d1f6206
- 길드 창(GuildModal)과 게임 메뉴(GameMenu)의 정보 구조·배지·서브탭·인라인 편집을 전면 개편했다. menuEntries.ts의 guildMenuBadges·guildMenuLabel과 GameMenu.tsx에서 길드장 대기 가입 신청(danger, 접힌 알림 점 점등)과 Lv.6 이상 남은 개인 강화 포인트(guild, 알림 점 미점등) 배지를 분리 연결했고, 공용 TabBar·SubTabs·SlotCell·CountBadge에 guild 톤을 추가했다. GuildModal.tsx는 탭 순서를 스킬(기본·남은 포인트 배지)·길드원·항해일지·관리(신청 수 배지)로 재정렬해 680×560 고정 높이를 유지하고, GuildSkillsTab.tsx는 [공통](금색 5열 수직 트리·모인 골드·기부)과 [개인](Lv.5 이하 잠금 안내, Lv.6+ 보라 5열 트리·남은 강화 포인트 5칸·강화 올리기·되돌리기) 서브탭으로 분리해 전환 시 높이 흔들림 없이 동작하도록 구성했다. [개인] 서브탭은 열별 +1 버튼을 제거하고 [공통]과 동일한 단일 단계 표시 푸터(N단계·Lv.6 해금)를 유지한 채 스킬 열 선택 후 하단 [강화 올리기] 버튼으로 강화하도록 통일했으며(uiGuard.test.ts 소형 +1 버튼 예외 제거), 되돌리기 확인 창의 누적 초기화 비용 단계표를 비용 줄 옆 물음표 IconButton TipCard로 옮겼다. GuildMembersTab.tsx와 GuildModal.tsx 확인 창(떠나기·해산·내보내기)에 20시간 모든 길드 재가입 제한 안내를 추가하고, GuildLogbookTab.tsx 아이콘 톤을 차분하게 정리했으며, GuildManageTab.tsx는 구획 순서를 길드 이름→가입 방식→권유 문구→고유 코드와 링크→가입 신청으로 배치하고 승인 가입 초대 링크 안내, 권유 문구 1줄 인라인 편집(Esc 시 편집만 취소·모달 유지), TableBox scroll="x" 기반 가입 신청 표(중첩 세로 스크롤 제거)를 반영해 단위·화면 테스트를 보강했다.
  - 게임 메뉴 길드 줄 배지·알림 점 및 길드 창 상단 탭·배지(menuEntries·GameMenu·GuildModal·TabBar·CountBadge): 이전 길드 줄 배지·알림 점 부재, 길드원 기본 탭 및 스킬 탭 배지 미표시, 이후 길드 줄 danger(가입 신청, 알림 점 점등)·guild(남은 포인트) 배지 추가, 스킬(보라 배지)·길드원·항해일지·관리(금색 배지) 순 재정렬 및 680×560 고정 높이 유지
  - 길드 스킬 [공통]/[개인] 서브탭 분리, 열 푸터 통일 및 되돌리기 비용 툴팁(GuildSkillsTab·SubTabs·SlotCell·guild): 이전 공용 기부와 개인 자유 강화가 단일 트리에 혼재, 되돌리기 창 인라인 회차 및 하단 누적 상자 노출, 이후 [공통](금색 트리·기부)과 [개인](Lv.6 해금·보라 트리·열별 +1 없는 단일 단계 푸터·열 선택 후 [강화 올리기]·되돌리기) 서브탭 분리(동일 높이) 및 초기화 비용 [?] TipCard 툴팁 이동
  - 길드원·항해일지·관리 탭 정비(GuildMembersTab·GuildLogbookTab·GuildManageTab·TableBox): 이전 확인 창 재가입 제한 강조 부재, 권유 문구 비인라인, 관리 표 중첩 세로 스크롤 및 승인 가입 초대 링크 안내 부재, 이후 20시간 재가입 제한 강조 안내, 항해일지 차분한 아이콘, 관리 탭 5구획 순서(길드 이름→가입 방식→권유 문구→고유 코드와 링크→가입 신청)·승인 가입 초대 링크 안내·권유 문구 1줄 인라인 편집(Esc 유지)·TableBox scroll="x" 단일 세로 스크롤 적용
  - 커밋: 673d0739, cfbfc3a8, ea60d8d9, b4d542e3, aec3287e, e9cbeb7a, 493c1f76
- 가방 유물 탭(BagTab)과 아이템 탭(ItemSection)에서 미보유 항목·미해금/게스트 상태의 도시락·미끼·생명의 기운 플레이스홀더 카드를 비활성으로 표시하고 보유 중만 보기 토글(ToggleChip)을 추가했다. 또한 도시락·미끼·비약 상세 창(ItemDetail.tsx)을 신설해 바깥 카드 주의사항을 정리하고, 달빛 미끼의 nightUnlock 같은 비수치 효과를 키-값 쌍 대신 상세 설명 한 줄(낮에도 밤 어종이 함께 낚여요.)로 표시하도록 통일했다.
  - 가방 아이템·유물 미보유 표시, 보유 필터 및 ItemDetail 신설(BagTab·ItemSection·ItemDetail): 이전 미보유 유물·아이템 비노출(미해금 시 빈 3칸), 바깥 카드 주의사항 중복, ItemDetail 부재 및 달빛 미끼 키-값 축약, 이후 미보유·미해금 플레이스홀더 카드 및 보유 중만 보기 토글 추가, ItemDetail 상세 창 신설, 비수치 효과 한 줄 설명 전환
  - 커밋: 05b113cd, 4682656b, 8ec6d7ba, 1199c5fd, a1986d92, 6acae9ce, 382ed7d7
- src/index.css에 `--c-mutation(#f472b6)`과 `--c-named(#ff7a59)` 토큰 및 `mutated-shimmer` 자홍빛 키프레임을 신설해 영웅 보라색(`--c-epic: #ba68c8`)을 영웅 등급 단독으로 분리했다. RarityTag(`HighlightRarityText`), Inset(`mutation`·`named` 테두리), CountBadge(`named`), FloatingToastLayer(`named`·`mutation` 톤), menuEntries·toastPolicy·catchNotice(최초 돌연변이 포획 토스트 `mutation` 톤, 네임드 흔적 `named` 톤)와 CatchCard·InstanceLine·BagCards·AwayReportModal·boardParts·NamedCard·TraceCard·VDexNamed·NamedDetail·GuildLogbookTab·TutorialCardVisual에 전용 색과 반짝이/표적 표식을 적용했다.
  - 돌연변이·네임드 전용 색상 토큰 및 UI 표식 분리: 이전 영웅 등급 보라색(`--c-epic`)을 돌연변이와 네임드 강조·배지·토스트·카드·일지 아이콘에 공용 사용, 이후 돌연변이 `--c-mutation(#f472b6)`(반짝이·잔광)과 네임드 `--c-named(#ff7a59)`(표적·외곽선) 전용 토큰·톤 분리, 영웅 보라 단독 유지
  - 커밋: 75208f9c, 4dbafa8d, d9c08fad, 5131a4fe
- 스테이지 HUD 미니맵 위 보너스 통합 칩(SlotChips)과 전용 상세 창(ActiveEffectsModal)을 개편했다. features/fortune/model/fortune.ts와 features/kitchen/model/slots.ts에 효과 칩 4행 2열 최소 요약 모델과 적용 중인 효과 4구획(도시락·미끼·비약·오늘의 운세)·독립 곱연산 배수 모델을 추가했다. SlotChips는 데스크톱 호버 시에만 4행 2열 최소 요약(활성/비활성, 남은 슬롯 수, 운세 이름)을 표시하고 클릭·터치 시 툴팁 대신 ActiveEffectsModal(layer="stage")을 바로 열도록 연결했으며, HudLayout·GameView에서 가방 아이템 탭과 스탯 보너스 탭 이동 경로 및 단위·통합 테스트를 추가했다.
  - HUD 보너스 통합 칩 호버 툴팁과 클릭 동작(SlotChips·ActiveEffectsModal): 이전 호버·터치 툴팁에 세부 효과와 남은 시간 목록을 길게 표시하고 전용 상세 창 부재, 이후 데스크톱 호버 시 도시락·미끼·비약·운세 4행 2열 최소 요약만 표시하고, 클릭·터치 시 적용 중인 효과 스테이지 창(세부 효과·남은 시간·가방 열기·전체 보너스 보기) 즉시 열기
  - 커밋: a4c83c76, 26d22fb2
- TutorialModal을 4종 17항목(마을 4·바다 5·수배 의뢰 3·네임드 5) 그림 포함 1페이지 1항목 카드(1/N, 이전·다음·완료, TutorialCardVisual.tsx)로 개편하고, VHelp.tsx에서 폐지된 이메일 로그인·이사 코드·옛 설명을 없애고 구글 단일 인증·운세·비약·길드·업적·우편함·랭킹 5탭·바운티 완화·여객선·새벽 4시 일일 초기화 기준으로 전면 개편했다.
  - 튜토리얼 창 및 도움말 탭 구성(TutorialModal·VHelp): 이전 단일 텍스트 목록 튜토리얼 및 이메일 로그인·구버전 기준 도움말, 이후 그림 포함 1장씩 넘기는 카드형 튜토리얼(17장) 및 최신 시스템·간결 문구 기준 도움말 전면 개편
  - 커밋: 7c7cd72e, 65271ac2, 8ec6d7ba
- 스테이지 출항·기능 해금 경로에서 여는 연결 창(AccountModal layer="stage")을 설정 탭의 계정 관리 창과 분리해 계정 삭제·이메일·건조 요소를 뺐고, 포구 출항 차단 후 구글 OAuth 복귀 시 sailReturn(sessionStorage)으로 집 앞 대신 대양 출항 위치로 바로 이동하도록 연결했으며, 조선소·목공소(FacilityModal)에서 배 구매 후 창이 닫히지 않고 유지되도록 수정했다.
  - 출항 전용 연결 창 분리, 포구 로그인 후 대양 즉시 이동, 배 구매 후 조선소 창 유지: 이전 출항 차단에 계정 관리 창 공용, OAuth 복귀 시 집 앞 스폰, 배 구매 시 창 자동 닫힘, 이후 출항 전용 연결 창 분리, 포구 로그인 완료 시 대양 출항 위치 직행(accountFailed 시 차단 방지), 배 구매 후 창 유지
  - 커밋: 7704e97a, c0829a7f, aed5986e, ea68ebe7

### 밸런스

- 바다 6구역(태평양·동남아·인도양·마다가스카르·남대서양·북대서양)의 지역 누적 업적 18종을 수동 챔질 카운터(manual.legendary.*, manual.variant.<구역>)에서 state.dex 기반 수동+방치 합산 집계로 전환했다. src/game/content/achievements.ts에 dexLegendary/dexNightLegendary/dexVariant 소스 타입과 정리된 게임 안내 문구(<구역> 전설/밤 전설/돌연변이, 손맛 제거)를 반영하고, src/game/rules/achievements.ts와 api/action.ts(빠른 캐치 보너스 계산 시 도감 로드 보장)에서 낮/밤 전설(normal.count+variant.count) 및 돌연변이(variant.count) 도감 합산을 계산하도록 구현했다. src/features/admin/model/contentCatalog.ts의 집계 표기를 도감 포획 수로 갱신하고, tools/balance/flow/counterBonus.ts의 시뮬레이션 보너스 키를 맞췄다. 전역 3종(전체 전설/밤 전설/돌연변이 손맛)과 manual.* 카운터는 기존 수동 기준을 유지한다.
  - 바다 6구역 지역 누적 보너스 18종 집계 기준 및 문안(전역 3종·manual.* 카운터 유지): 이전 수동 챔질 전용 카운터(manual.legendary.*, manual.variant.<구역>) 기반 집계 및 손맛·직접 챔질 문구, 이후 state.dex 수동+방치 합산 집계(낮/밤 전설 normal+variant, 돌연변이 variant) 및 <구역> 전설·밤 전설·돌연변이 문구(도감 소급 반영)
  - 영향: 기존 플레이어를 포함해 보유 도감(state.dex) 수동+방치 누적 마릿수가 바다 6구역 지역 누적 보너스 18종 단계에 즉시 소급 반영되며, 전역 3종과 manual.* 카운터는 변경되지 않는다.
  - 커밋: 921d1160, 619e25c4, b87a2ce2, 3706c0bd
- firstCatch.ts의 마을 연못·강 하드코딩(5회차 영웅·10\~15회차 전설)을 재사용 가능한 해역별 횟수 상한 테이블(FIRST_CATCH_SPOT_CAPS: pond 20, river 30) 기반 미보유 일반 폼 전종 1회 이상 보장(구 세이브 비재활성화)으로 전환하고, DexGrid.tsx·toastPolicy.ts·useGame.ts에 해역 일반 도감 100% 완성 축하 알림과 완료 표시를 추가했다.
  - 마을 해역 첫 경험 보장 방식(FIRST_CATCH_SPOT_CAPS): 이전 마을 연못·강 5번째 영웅, 10\~15번째 전설 고정 보장, 이후 해역별 횟수 상한(pond 20회·river 30회) 내 미보유 일반 폼 전종 보장(보장 캐치는 일반 폼 고정)
  - 해역 일반 도감 완성 축하 알림 및 완료 표시: 이전 도감 완성 시 독립 축하 토스트·완료 표시 부재, 이후 해역 일반 폼 전종 달성 시 축하 알림과 도감 완료 표시 추가
  - 영향: 마을 연못·마을 강 초반 플레이 시 정해진 상한 안에서 일반 폼 6종을 모두 확보할 수 있으며, 도감 완성 시 업적 해금 여부와 무관하게 축하 알림과 도감 완료 표시가 노출된다.
  - 커밋: e96f1592, 8033fb44, 6379fa05, eb475087, 5d834d88

### 수정

- GameView.tsx의 마을 튜토리얼 트리거를 집 거점(base: home) 제외 마을 야외 진입 시점으로 한정하고, useGame.ts에서 village 첫 진입 시 신규 해역 알림을 띄우지 않고 world 첫 출항 문구만 바다 맥락으로 다듬었다. 또한 useGame.ts·httpGameGateway.ts·App.tsx·profileStatus.ts에서 부트 전 프로필 조회 경합을 막고 loading/loaded/empty/error 4상태를 구분해 게스트 첫 접속에서 불러오는 중 고착을 해소했다.
  - 마을 튜토리얼·신규 해역 알림 및 게스트 닉네임 비동기 상태: 이전 집 거점서 마을 튜토리얼·신규 해역 [마을] 오출력, 부트 경합·null 폴백으로 닉네임 불러오는 중 고착, 이후 마을 야외 한정 튜토리얼·대양 첫 출항 알림만 노출, loading/loaded/empty/error 4상태 분리 및 profileStatus prop 전달
  - 커밋: affa3f7c, 2820b802, 5541b01e, b7e68507, 75434138

## [0.20.4] - 2026-11-24

### 기능

- HOME.furniture에 여객선(ferry)을 추가하고 BaseMenu 이동 구역에 문과 함께 배치했다. pacific 존에 entryBoat가 없어 portGate가 0이던 문제를 보완해 항구·바다(world) 빠른 이동과 travel 액션에 최소 배 1단계(boat >= 1) 및 게스트 잠금(menuLock, guestActionVerdict)을 적용했다. 집 출발 시 확인 문구를 분리하고 집 문 앞(마을)을 0.6초 보여 준 뒤 암전 전환으로 목표 항구 앞바다로 이동한다.
  - 집 거점 여객선 빠른 이동 배치 및 최소 배 게이트: 이전 항구 거점에만 여객선 배치, harbor의 portGate 0으로 배 0단계 차단 부재, 이후 집·항구 모두 여객선 배치, 항구·바다 빠른 이동 boat >= 1 및 게스트 잠금 강제, 집 문 앞 0.6초 전환
  - 커밋: 658a4d3d, af564391

### UI

- BagTab 물고기 섹션의 자동 잠금·기운 얻기 버튼을 sticky bottom-0 불투명 바(PC 사이드바·모바일 시트 공통)로 고정했다. 가방 하단 기운 얻기 진입(panel === "energy") 시 2칸 SaleWindow 대신 480px 단열 Modal(sm)과 EnergyPanel(등급 토글 칩 기본 미잠금 전체 선택, 4종 기운 획득 요약, 확정 후 닫힘)을 쓰도록 분리하고, 거점 궤짝·어시장(panel === "sell")의 2칸 SaleWindow는 유지했다.
  - 가방 하단 액션 바 sticky 고정 및 가방 기운 얻기 창 분리: 이전 스크롤 하단 이탈 버튼 바, 가방 기운 얻기 클릭 시 920px 2칸 SaleWindow 공유, 이후 물고기 섹션 하단 sticky 고정 바, 480px 단열 EnergyPanel 신설(확정 시 창 닫힘)
  - 커밋: 0d78e297, 72417c43, ea77b426, f3c261a6
- DexTab 상단에 1단 보기 SubTabs(일반·돌연변이·네임드)를 두고 GameTabs의 setDexView와 연결했으며, 기존 2단 구역 SubTabs와 도감 탭 재선택·숫자키 3 순환·Tab/Shift+Tab 구역 순환을 그대로 유지했다.
  - 도감 탭 1단 보기 서브탭 추가: 이전 도감 탭 재클릭·숫자키로만 보기 전환, 본문에는 구역 서브탭 1단만 표시, 이후 상단 1단 보기 SubTabs + 하단 2단 구역 SubTabs 2단 구조 및 단축키 순환 동기화
  - 커밋: 0d78e297, 72417c43
- HudLayout의 statusSlot을 STACK_TRUNK_CLASS 밖 독립 고정 슬롯(absolute, z-(--z-stage-status), slotAt < trunkAt)으로 유지하면서 세로 좌표를 top-20·mobile:top-7에서 bottom-24·mobile:bottom-24로 옮겼다.
  - statusSlot 세로 위치 하단 중앙 복귀: 이전 PC top-20 · 모바일 mobile:top-7 헤더 바로 아래 고정, 이후 PC·모바일 모두 bottom-24 하단 중앙 독립 고정(방치·흔적·메시지 창 변화와 무관)
  - 커밋: a7a3e629

### 밸런스

- 0040_guild_member_enhancements 마이그레이션과 api/_data/guilds.ts·load.ts 개편으로 Lv6–10 자유 강화를 (guild_id, user_id) 개인 저장·개인 적용으로 전환했다. 개인 초기화(20,000,000G)는 본인 투자분만 초기화하고 탈퇴·추방 시 해당 길드원의 행을 삭제하며 공용 guild_logs에는 새 강화·초기화를 남기지 않는다(과거 로그 읽기 호환 유지). GuildSkillsTab에서 상단 단계 색상 범례를 제거하고 각 스킬 단계 노드에 Tip 툴팁을 붙였으며 BonusTab과 확인 창 문구를 개인 기준으로 정리했다.
  - 길드 Lv6–10 자유 강화 적용 범위 및 저장 테이블: 이전 guild_bonuses.enhance_rank 길드 공용 저장·전원 공유, 초기화 시 공용 초기화 및 guild_logs 기록, 이후 guild_member_enhancements(0040) 개인별 저장·적용(Lv6부터 레벨당 1포인트, 최대 5), 20,000,000G 본인 초기화·탈퇴 시 삭제·항해일지 비기록, 기존 enhance_rank 0 초기화
  - 길드 스킬 단계 색상 안내 위치: 이전 상단 고정 Inset 범례(스킬 단계 색상 안내), 이후 상단 범례 제거, 각 스킬 단계 노드 Tip 툴팁(기본 단계·개인 자유 강화)으로 이동
  - 영향: 마이그레이션 0040으로 public.guild_member_enhancements(guild_id, user_id, bonus) 표를 추가하고 기존 공용 guild_bonuses.enhance_rank를 모두 0으로 초기화한다. 되돌리기는 0040_guild_member_enhancements.down.sql 적용.
  - 커밋: bc84adb4, 20018a2e

### 수정

- 공용 Inset이 유틸리티 border-line을 기본 부착해 호출부 className의 border-epic·border-legend·border-gold·border-accent가 CSS 선언 순서상 밀리던 결함을 전용 border prop(InsetBorder) 치환으로 해결했다. PlayerInfo 등 전체 호출부 8곳을 전환하고 uiGuard.test.ts(insetBorderOverrides)와 회귀 테스트를 추가했다.
  - 공용 Inset 테두리 색 지정 방식 및 사용처 8곳 전환: 이전 Inset 기본 border-line + className 문자열 결합으로 border-epic·border-legend 등 덮어쓰기 누락, 이후 Inset border prop으로 기본 테두리 색 치환, 사용처 8곳 일괄 전환 및 uiGuard 정적 차단 추가
  - 커밋: 46f2b3f1

## [0.20.3] - 2026-11-24

### UI

- 하루 3,600초 주기의 시계 단계를 실제 25초당 10게임분(시간당 144스텝)으로 세분화하고 정수 분 계산으로 부동소수점 1분 오차를 제거했다. useNow 갱신 주기를 5초로 줄이고 개발 도구 시간대 막대 폭 비율과 25초 스텝 슬라이더를 동기화했다.
  - 게임 시계·어둠 단위 세분화 및 개발 도구 주기 막대 정비: 이전 1실제분(24게임분) 계단 전환 및 부동소수점 일부 오표기, 개발 도구 60분 비율 막대 왜곡, 이후 25초당 10게임분(144스텝) 정수 분 표시, 5초 폴링, 개발 도구 비율 막대 및 스텝 슬라이더 적용
  - 커밋: bd2e52e2

### 밸런스

- 정각 00:00 기준을 유지하면서 낮/밤 전환 시각을 게임 04:00\~20:00에서 06:00\~22:00으로 옮겨, 밤이 게임 22:00\~다음 06:00(실제 매시 55분\~15분 미만)에 열리게 했다.
  - 낮/밤 시간대 경계 이동: 이전 낮 게임 04:00\~20:00(10\~50분) · 밤 게임 20:00\~04:00(50\~10분), 이후 낮 게임 06:00\~22:00(15\~55분) · 밤 게임 22:00\~06:00(55\~15분)
  - 영향: 밤 구간 총 길이(20분, 하루의 1/3)는 그대로 두고 실제 55분\~15분(게임 22시\~06시)으로 이동한다
  - 커밋: bd2e52e2
- 밤 22시(0)→심야 02시(1)→06시(0) 대칭 삼각파 nightDepth를 기준 지표로 두고 darkness와 밤 어종 기본 가중치(2×nightDepth)를 연동했다. 밤 어종 출현 미끼 활성 시와 밤 강제 상태에서는 nightDepth=1을 고정 적용하고, nightDepth=0 경계에서는 밤 어종을 추첨·천장 후보 및 빠른 경로 조회에서 제외한다.
  - 밤 깊이(0→1→0) 기준 신설 및 밤 어종 가중치(0→2)·밸런스 모델 연동: 이전 밤 시간대 전체에서 밤 어종 개체 가중치 2 고정, 어둠 정점 자정 00:00, 이후 심야 정점 02:00 기준 0→2 대칭 스케일링(미끼 활성 시 2 고정), 밸런스 모델 48스텝 평균 반영
  - 영향: 밤 시작(22시)에는 밤 어종 가중치 0, 심야 정점(02시)에서 2로 올라 수동 도감작 효율이 심야에 집중된다
  - 커밋: bd2e52e2

### 수정

- TimeBadge가 phase 대신 dark >= 0.15(MOON_AT)로 아이콘을 판정해 밤 경계 양끝에서 해 아이콘을 보이던 불일치를 제거하고 phase === night 기준으로 일치시켰다.
  - TimeBadge 해/달 아이콘 판정 일치: 이전 darkness < 0.15 조건 때문에 실제 밤 경계 구간에서 해 아이콘 표시, 이후 useGameTime().phase === night 판정으로 밤 전 구간 달 아이콘 표시
  - 커밋: bd2e52e2

## [0.20.2] - 2026-11-24

### 기능

- KST 04:00 날짜 경계 기준으로 계정별 오늘의 운세(3종 균등, 적당한 운 +3% 40% / 좋은 운 +5% 60%)를 첫 접속 또는 catch·sell 첫 판정에서 고정한다. 첫 접속 모달과 스탯 보너스 탭에서 노출하고, 판매 미리보기에도 재물운 배율을 반영한다.
  - 일일 운세 추첨·고정 및 보너스 배율 적용: 이전 일일 운세 시스템 없음, 이후 풍어운(희귀+)·재물운(판매가)·그림자 운(네임드) +3%·+5% 운 배율 적용 및 접속 모달·보너스 탭·판매 미리보기 노출
  - 커밋: 9bc2296d, 217a665c, 9612a78f
- canExtractEnergy가 거점(집·항구, 요리 해금) 외에 바다에서도 가공 플랜트선 이상 보유 및 비게스트 조건이면 extractEnergy를 허용한다. 바다 가방에서 열 때는 판매 창이 기운 얻기 탭으로 바로 열리며 판매 탭은 잠금 안내와 함께 비활성화한다.
  - 가공 플랜트선 바다 기운 얻기 진입 및 판매 탭 분리 잠금: 이전 거점(집·항구)에서만 수동 기운 얻기 가능, 이후 가공 플랜트선 이상 비게스트 계정은 바다 가방에서 기운 얻기 창 진입 가능(판매 탭 잠금)
  - 커밋: cbe0c97f

### UI

- 가방 상단에 물고기/아이템/유물 3서브탭을 두고 Tab 및 탭 재선택 순환을 연결했다. 물고기 섹션 우상단에 목록/카드 전환 아이콘, 하단에 자동 잠금·기운 얻기 2열 버튼을 배치했다. 아이템 섹션은 2열 카드형으로 생명의 기운 4종 16x16 픽셀 스프라이트와 도시락·미끼 총 지속 시간(그물망 배수 반영)·활성 효과 사용 중 배지 및 남은 시간을 표시하고 도움말 안내도 동기화했다.
  - 가방 3서브탭 개편 및 아이템 카드형·지속 시간·기운 아이콘 도입: 이전 가방 단일 화면에 항목·버튼이 섞여 있었고 요리 지속 시간과 기운 아이콘이 없었음, 이후 물고기/아이템/유물 3서브탭 분리, 아이템 카드형+총/남은 시간 표시, 생명의 기운 4종 픽셀 아이콘 적용
  - 커밋: cbe0c97f
- FishPickTable 상단에 보유 등급별 일괄 선택 칩 스트립을 추가해 판매 탭과 기운 얻기 탭에서 해당 등급의 미잠금 물고기를 한 번에 선택·해제할 수 있게 했다.
  - 판매·기운 얻기 어종 표 상단 등급 일괄 선택 칩 추가: 이전 어종별 행을 펼쳐 개별 선택해야 했음, 이후 등급 칩으로 해당 등급 미잠금 물고기 일괄 선택·해제 가능
  - 커밋: b645ebb6
- 스테이지 상태 안내 슬롯을 하단 flex-wrap 카드 묶음에서 분리해 고정 슬롯·독립 z 계층으로 두고, 게임 영역 유래 모달은 stage 스코프로 내려 Sidebar inert 및 클릭 차단 우회 코드를 제거했다.
  - 스테이지 상태 안내 슬롯 고정 및 사이드바·모달 계층 스코프 분리: 이전 방치 결과 카드 등 표시 변화 시 입질 안내 위치 이동 및 스테이지 모달 중 사이드바 차단, 이후 상태 안내 위치 고정 및 스테이지 모달 표시 중에도 사이드바·탭 전환 정상 동작
  - 커밋: 0a2c9d85

### 밸런스

- REPORT_MIN_MS를 2분에서 5분으로 상향하고 useAwayReport에서 기준 미만 부재 시 복귀 보고 조회와 메시지 창 안내 줄 출력을 생략하도록 변경했다.
  - 방치 알림 최소 부재 기준 상향 및 미만 부재 보고 생략: 이전 2분 이상 부재 시 방치 알림 카드·복귀 메시지 표시, 이후 5분 이상 부재 시에만 방치 알림 카드·복귀 메시지 표시, 미만 생략
  - 영향: 5분 미만 짧은 부재 시 방치 알림 카드와 복귀 메시지가 뜨지 않는다
  - 커밋: df6d5b08, eb82fd32

### 수정

- SellTab 확정 버튼에서 AdjustedAmount를 분리해 버튼 위 확정 정보 줄로 이동하고, PickTab의 h-11 고정 높이를 min-h-11로 전환했으며 uiGuard에 텍스트/수치 버튼 고정 높이 금지 가드를 추가했다.
  - 판매 확정 버튼 보정 금액 분리 및 공용 버튼 최소 높이 전환: 이전 확정 버튼 안 긴 보정 금액이 줄바꿈되어 고정 44px 버튼 밖으로 넘침, 이후 받을 골드는 버튼 위 정보 줄에 표시하고 버튼은 선택 마릿수만 표기하며 min-h-11 적용
  - 커밋: 48f260ae
- 액션 종류에 따라 너무 빠르다는 경고를 정하는 조건을 바로잡았다.
  - 커밋: af9a9559

## [0.20.1] - 2026-11-24

- 이 버전에 기록된 변경이 없다.

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

### 기타

- 게스트도 액션 확정 때 업적 카운터 증가와 claimable 저장을 받는다. 판정이 기록만 읽으므로 마을 격리 규칙과 부딪히지 않는다. 게스트에게는 메뉴 줄의 업적 항목을 잠그고 배지를 숨기며 수령 액션을 거절한다. 계정을 연결하면 게스트 때 쌓은 업적을 업적 창에서 받을 수 있다. 순위와 공개 표시에 업적을 쓰면 게스트와 제재 계정은 넣지 않는다.
  - 커밋: 4dee057b, 2d1eb62a

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
  같은 커밋에서 입질 대기 단축을 레벨마다 최소와 최대 둘 다 ×0.94에서 강화마다 한쪽만 ×0.94(홀수 레벨에서 강화하면 최대, 짝수 레벨에서 강화하면 최소)로 바꿨다.
  강화 한 번의 비용은 레벨 1, 2, 3에서 오르고 레벨 4부터 내린다. 누적 강화비는 레벨 5 도달까지는 새 식이 더 크고 레벨 6 도달부터 새 식이 더 작다.
  - 강화비 식(레벨 L에서 L+1): 이전 L이 15 이하이면 round(50 × 1.7^(L−1)), 16 이상이면 round(50 × 1.7^14 × (L/15)^8), 이후 모든 레벨에서 round(100 × 1.25^(L−1))
  - 강화 한 번의 비용(레벨 1, 2, 3, 4, 5): 이전 50, 85, 144, 246, 418, 이후 100, 125, 156, 195, 244
  - 강화 한 번의 비용(레벨 10, 15, 20, 30, 40, 50): 이전 5,929 / 84,189 / 840,940 / 21,552,362 / 215,280,534 / 1,283,171,975, 이후 745 / 2,274 / 6,939 / 64,623 / 601,853 / 5,605,194
  - 누적 강화비(레벨 6, 11, 16, 21, 27, 31, 41, 51 도달): 이전 943 / 14,329 / 204,388 / 2,335,456 / 23,441,069 / 83,114,206 / 1,068,047,330 / 7,787,441,602, 이후 820 / 3,324 / 10,967 / 34,293 / 131,949 / 322,717 / 3,008,864 / 28,025,566
  - 영향: 높은 레벨의 강화비가 크게 내려 해역 요구 레벨 상향과 함께 진행 속도의 기준이 바뀐다. 이미 올린 레벨은 그대로이고, 옛 누적과 새 누적의 차액은 우편으로 보낸다. 되돌리려면 ROD의 강화비 값과 식을 이전으로 돌린다. 되돌리면 그 사이 새 비용으로 올린 레벨과 지급한 차액 우편은 남는다.
  - 커밋: 26637ae7
- 입질 대기 단축을 레벨마다 최소와 최대 둘 다 ×0.94에서 강화마다 한쪽만 ×0.94(홀수 레벨에서 강화하면 최대, 짝수 레벨에서 강화하면 최소)로 바꿨다. 레벨 1의 4\~8초는 그대로이고, 레벨 L의 최소 = 4 × 0.94^내림((L−1)/2), 최대 = 8 × 0.94^올림((L−1)/2)다. 타이밍 바 시간(1.4초)은 그대로다. 강화비 변경과 같은 커밋이다.
  - 입질 대기 단축: 이전 레벨마다 최소와 최대 둘 다 ×0.94(레벨 L의 대기 = 4\~8초 × 0.94^(L−1)), 이후 강화마다 한쪽만 ×0.94(최소 = 4 × 0.94^내림((L−1)/2), 최대 = 8 × 0.94^올림((L−1)/2))
  - 레벨 12 입질 대기(최소\~최대): 이전 약 2.03\~4.05초, 이후 약 2.94\~5.52초
  - 영향: 같은 레벨의 입질 대기가 이전보다 길어 시간당 캐치 수가 줄어든다. 높은 레벨일수록 차이가 크다. 되돌리려면 rodStats의 감쇠 지수를 이전으로 돌린다.
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
  - 영향: 기존 플레이어는 낚싯대 레벨이 그대로라, 지금 낚던 해역의 요구 파워를 채우지 못할 수 있다. 강화비 인하와 차액 우편으로 다시 올릴 수 있게 했다. 방치 배수는 진입 레벨과의 차로 정하므로 해역마다 방치 수입 기준도 함께 바뀐다. 되돌리려면 해역 표의 powerReq를 이전 값으로 돌린다.
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
  - 영향: 가방과 전시대에 든 개체의 판매가가 반영 즉시 새 값으로 바뀐다. 내린 어종의 보유분은 보전하지 않는다(소급 보전 원칙의 예외). 방치 EV가 바뀌어 의뢰와 토벌 보상을 함께 다시 산출했다. 되돌리려면 어종 표의 price를 이전 값으로 돌린다. 그 사이 판 골드는 남는다.
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

### 기타

- 기존 플레이어의 낚싯대 레벨은 바꾸지 않고 세이브 이관도 없다. 옛 누적 강화비에서 새 누적 강화비를 뺀 차액을 골드 우편으로 보낸다.
  대상은 게스트가 아닌 저장 보유 계정이다. 금액은 배포 직전 낚싯대 레벨로 다시 계산하고 상한이나 감액을 두지 않는다. 새 누적이 더 큰 레벨(레벨 5 이하)은 보상이 없다.
  - 기존 플레이어의 낚싯대 레벨: 이전 보유 레벨, 이후 그대로(이관 없음)
  - 강화비 차액 우편 금액(레벨별 예, 옛 누적 − 새 누적): 이전 없음, 이후 레벨 6은 123, 레벨 11은 11,005, 레벨 16은 193,421, 레벨 21은 2,301,163, 레벨 27은 23,309,120, 레벨 31은 82,791,489골드
  - 영향: 높은 레벨 계정은 차액이 크다(레벨 27 기준 약 2,331만 골드). 차액은 새 식에서 옛 누적 강화비와 같은 골드로 닿는 레벨까지 올릴 수 있는 양이다(레벨 27 계정은 새 식으로 레벨 50까지 올릴 수 있고, 세인트헬레나의 새 진입 레벨 51에는 조금 모자란다). 게스트는 받지 못한다.
  - 커밋: 26637ae7

## [0.19.1] - 2026-11-13

### 밸런스

- 요리 종류별 조리 대기(1개당)를 줄였다. 값은 콘텐츠 표 COOK_KIND_RULES의 waitMs이고, 슬롯 지속(slotMs)은 바꾸지 않았다.
  조리 상태는 시작 시각(startedAt)만 저장하고 완성 수는 조회 때 cookingProgress가 현재 waitMs로 계산하므로, 반영 시점에 이미 조리 중인 요리에도 새 대기가 적용된다.
  - 조리 대기(미끼 요리 1개): 이전 15분, 이후 1분
  - 조리 대기(도시락 1개): 이전 60분, 이후 15분
  - 영향: 조리 중인 요리는 시작 시각 기준으로 다시 계산되어 반영 직후 완성 수가 늘 수 있다. 결과 수량은 줄지 않는다. 되돌리려면 COOK_KIND_RULES의 waitMs를 이전 값으로 돌린다. 되돌리면 조리 중인 요리의 완성 수가 다시 계산되지만 이미 보관함으로 정산된 수량은 남는다.
  - 커밋: 2866b5f3

## [0.19.0] - 2026-11-13

### 기능

- 요리 순환을 추가했다. 콘텐츠 표는 src/game/content/cooking.ts(RECIPES, COOK_KIND_RULES, COOK_STORAGE_CAP), 판정은 src/game/rules/cooking.ts의 순수 함수(canCook, cookingProgress, settleCooking, canEat, appliedSlots, slotEffects)가 맡고 리듀서, 서버, 화면은 이 판정을 쓴다.
  해금은 배 단계에서 파생하고 저장하지 않는다(cookingUnlocked). 해금 단계 COOKING_UNLOCK_BOAT는 인도양 존의 진입 배 단계(5단계 증기선)에서 읽는다. 집 거점에 부엌 가구(kitchen)를 더했고 부엌 창은 도시락 탭과 미끼 탭으로 나뉜다. 기운 얻기는 판매 창의 탭이다.
  조리: 집에서만, 한 번에 레시피 하나만 조리한다(조리 중이면 cooking-busy). 시작할 때 레시피 기운을 수량만큼 차감하고 시작 시각을 서버 시각으로 둔다. 완성 수는 시작 시각과 서버 시각에서 파생하고(1개당 대기), 완성품은 다음 조리, 먹기 때 보관함(items의 레시피 id 행)으로 정산한다. 보관함 상한은 완성품과 조리 중 수량의 합이다(초과 시 storage-full). 기운이 모자라면 not-enough-energy.
  레시피 9종: 도시락 5종(가루디야, 민 몰리, 생선 비리야니, 암불 티얄, 생선 탈리), 미끼 4종(사프란, 롱페퍼, 큐베브, 용연향 미끼). 판정 칸 미끼(메이스 미끼)와 판정 칸 효과는 설계에서 뺐다. 처음 구현에는 있었고 1a19196f에서 레시피(cook-bait-judge), 영역 폭 효과 종류와 합산, 수동 판정 바에 효과를 넘기던 경로, 부엌 모델의 숨김 조건, 밸런스 도구의 판정 칸 처리, 미끼 스프라이트를 지웠다. 도시락과 미끼의 효과는 각 레시피 항목에 적는다.
  서버 판정: 액션 extractEnergy, setEnergyTarget, resetEnergyTargets, cook, eat, dismissBaitRefund를 서버 리듀서가 판정하고, 액션 시각은 요청마다 서버 시각 하나로 정해 리듀서, 빠른 캐치 경로, 네임드 조우 추첨에 함께 쓴다. 클라이언트는 시각을 주장할 수 없다. cook, eat, setEnergyTarget, resetEnergyTargets, dismissBaitRefund는 가방 전체 읽기를 생략한다(SKIP_DETAIL). 게스트에게 요리 액션은 account-only로 닫고 dismissBaitRefund만 허용한다.
  세이브 v9: activeBait를 지우고 cooking(recipe, count, bonus, startedAt), slots(lunch, bait의 id와 endsAt), energyTargets, baitRefund를 더했다. 각 필드에 위생 처리(safeCooking, safeSlots, safeEnergyTargets, safeBaitRefund)가 있다. 이관 내용은 별도 항목에 적는다.
  가방 탭 아이템 섹션을 ItemSection으로 바꿨다: 생명의 기운 4칸 격자, 도시락과 미끼 행의 먹기, 쓰기 버튼, 교체 확인 창, 해금 전과 게스트 잠금 칸. 거부 문구는 채택 문안으로 고정했다.
  - 요리 해금 조건: 이전 없음(기능 없음), 이후 배 단계 5(증기선, 인도양 진입) 이상, 집 거점의 부엌
  - 조리 대기(1개당): 이전 없음, 이후 도시락 60분, 미끼 15분
  - 보관함 상한: 이전 없음, 이후 완성품과 조리 중 수량의 합 10
  - 동시 조리: 이전 없음, 이후 레시피 하나, 수량 1 이상 정수
  - 세이브 버전: 이전 v8(activeBait 포함), 이후 v9(activeBait 제거, cooking, slots, energyTargets, baitRefund 추가)
  - 커밋: aaba19ae, 1418467c, f7a83d5a, 84f468b5, fcb9919e, 242a80e6, d6635abf, f55ae090, d279acb3, fe4547e9, 0a932bff, e86a2268, 5d1ef301, 80261560, 1a19196f, 8777cf9f
- 판매 창(집의 궤짝, 항구의 어시장이 여는 창)의 기운 얻기 탭(EnergyTab, FishPickTable)과 규칙(energyGain, applyEnergyGain, canExtractEnergy)을 추가했다. 기운 얻기는 판매 시설이 있는 거점(집, 항구)에서, 요리 해금 뒤에만 한다. 바다와 가방 초과 때의 자동 기운 얻기는 없고, 가방 초과는 놓아주기만 한다.
  장소 판정은 거점 표 SALE_BASES로 한다(지금은 여섯 거점 모두 판매 시설이 있고, 표와 거점 가구의 일치는 월드 테스트가 지킨다). 바다와 마을 필드에서의 요청은 422 not-at-sale-base로, 해금 전 요청은 422 energy-locked로 거부한다. 해역 선택 액션(setEnergyTarget, resetEnergyTargets)의 해금 전 거부도 energy-locked다(canUseEnergy). 조리의 장소 거부(not-at-home)와 조리, 먹기의 해금 전 거부(cooking-locked)는 그대로다.
  처음 구현은 집 부엌 창의 탭이었고 집 거점에서만 했다(거부 코드 not-at-home, cooking-locked). e50ae9a8에서 장소 판정과 거부 코드를, 530c0ff4에서 탭의 자리를 판매 창으로 옮겼다. 탭은 게스트에게 게스트 잠금, 요리 해금 전에는 진행 조건 잠금으로 보인다(energyTabLock, 게스트 잠금이 먼저). 탭의 화면 구성은 별도 항목에 적는다.
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
- 게임 인증에 구글 공급자를 더했다(api/_auth/googleLink.ts, auth.ts). 구글에 요청하는 범위는 openid와 email뿐이고 계정 선택 화면을 매번 띄운다. 연결한 적 없는 구글 계정으로는 가입하지 않는다. 이메일이 같다는 이유로 자동 연결하지 않고, 연결은 로그인한 사용자가 직접 한다.
  경로는 셋이다. 게스트의 구글 연결(표지 link-guest): 게스트 표시를 내리고 진행을 그 계정에 유지한다. 이메일 계정의 구글 연결(link-email): 다음부터 구글로 로그인한다. 구글 로그인(sign-in): 이미 연결한 구글 계정으로 그 계정에 들어간다.
  연결 전 검증(validateGoogleLink)과 결과 코드: 계정당 구글 하나(google_already_connected), 구글 계정이 다른 계정에 연결돼 있거나 이메일 계정이 고른 구글의 주소를 다른 계정이 쓰는 경우(account_already_linked_to_different_user), 게스트의 구글 주소가 구글을 연결하지 않은 이메일 계정의 주소와 같은 경우(email_account_exists), 게스트의 구글 주소를 다른 구글을 연결한 계정이 쓰는 경우(unable_to_link_account), 연결한 적 없는 구글로 로그인(signup_disabled).
  화면 분기는 googleFlow 모델(googleOutcome)이 복귀 주소의 표지와 오류 코드로 정한다. 게스트가 고른 구글 계정이 이미 다른 계정에 연결돼 있으면 그 계정으로 로그인해 게스트 진행을 버릴지 묻는 확인 창(GoogleOverwriteDialog)을 띄운다. 그 밖의 실패는 안내 창이나 토스트로 알린다. 복귀는 이 탭에서 시작한 흐름에만 반응한다(세션 저장소 표지).
  게스트 화면에는 구글 공식 규격의 버튼(GoogleButton, GoogleLogo), 만 14세 이상과 이용약관, 개인정보 처리방침 고지, 약관 링크(/terms, /privacy)를 둔다.
  - 게임 로그인 수단: 이전 게스트(익명), 이메일과 비밀번호, 이후 게스트(익명), 구글, 기존 이메일 계정의 이메일과 비밀번호(구글을 연결하기 전까지)
  - 게스트가 계정을 갖는 방법: 이전 이메일과 비밀번호로 승격, 이후 구글 계정 연결
  - 커밋: a5f3888e, 38e58969, c662c586, 6823479e, bd191cd8, 62cd2398, 653b94a9, 17afd559, 6cee78f7, f590dbcf, 91cefa5c, 6c54f960

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
  - 탭: 판매, 기운 얻기. 기운 얻기 탭은 부엌 창에서 옮겨 왔다. 게스트에게는 게스트 잠금, 요리 해금 전에는 진행 조건 잠금으로 보이고 눌러도 열리지 않는다. 공용 탭 바(TabBar)에 잠긴 탭을 더했다. 잠긴 탭은 aria-disabled라 키보드 포커스를 받고, 공용 잠금 툴팁(LockTip)과 보조 기술용 설명(LockReason)을 쓰며 호버 색이 걸리지 않는다.
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
- 업데이트 소식 창의 표시 규칙을 다시 보지 않기 체크에서 마지막으로 본 버전 기준으로 바꿨다.
  - 대상(unseenNews): 마지막으로 본 버전 뒤부터 현재 버전까지 패치노트가 있는 버전 전부를 최신 순으로 한 창에 보인다. 버전 비교는 점으로 나눈 숫자 비교이고 노트 배열의 순서에 기대지 않는다. 이전에는 현재 버전의 소식 하나만 보였다(newsFor).
  - 기록: 기기별 저장값(localStorage pf-announcements)에 lastSeenVersion을 더했다. 소식 창이 보이는 때에 보인 가장 높은 버전을 기록하고 닫는 방식과 무관하다. 처음 시작한 플레이어는 창 없이 현재 버전까지 기록한다. lastSeenVersion이 없는 기존 저장값은 이전 형식의 dismissedVersion을 본 버전으로 쓰고, 둘 다 없으면 현재 버전의 소식 하나만 본다. dismissedVersion은 읽기만 하고 더 쓰지 않는다. 저장할 때는 저장소의 기존 값 위에 덮어써 모르는 필드를 보존한다.
  - 화면: 소식 창의 접속할 때 이 소식 띄우지 않기 체크를 없앴다. 버전이 하나면 버전 머리를 고정하고 목록만 스크롤하며(화면 높이 42% 상한), 여럿이면 버전 머리까지 한 스크롤 안에 잇는다(56% 상한). 설정 탭 패치노트의 최근 소식 다시 보기는 체크 없이 가장 최근 버전 하나를 연다.
  - 도움말의 업데이트 소식 안내 문구를 새 규칙에 맞췄다.
  - 접속 때 뜨는 소식의 범위: 이전 현재 버전의 소식 하나, 이후 마지막으로 본 버전 뒤부터 현재 버전까지 소식이 있는 버전 전부(최신 순)
  - 소식이 다시 뜨지 않는 조건: 이전 접속할 때 이 소식 띄우지 않기를 체크하고 닫음(체크하지 않으면 접속마다 뜸), 이후 창이 한 번 보이면 그 버전까지 본 것으로 기록(닫는 방식 무관)
  - 기기별 소식 기록: 이전 dismissedVersion, answered, 이후 lastSeenVersion 추가. dismissedVersion은 읽기 전용(lastSeenVersion이 없을 때만 기준)
  - 커밋: 7a16869c, c577e3fa, be82fd76

### 밸런스

- 유물 진주 상인의 저울(varuna-scale, 인도양 희귀)의 효과를 미끼값 할인에서 요리 추가 완성으로 바꿨다. 유물 효과 baitDiscount와 artifactEffectsAt의 해당 계산을 지우고, 요리 효과 cook.extraCookChance와 artifactExtraCookChanceAt, extraCookChance를 더했다.
  추가 완성: Lv1 값에 레벨 계수를 곱하고, 보유 유물의 확률을 더한 합은 1을 넘지 않는다. cook 리듀서가 조리를 시작할 때 수량마다 서버 rng로 추첨해 cooking.bonus에 저장하고, 완성된 수량만큼의 추가분을 보관함에 함께 넣는다. 추가분은 기운을 차감하지 않는다. cook 이벤트 payload의 bonus에 추가 완성 수를 남긴다.
  로어를 교체했다. 가방 유물 섹션과 효과 표기는 퍼센트포인트 표기로 보인다.
  - 진주 상인의 저울 효과(Lv1, 레벨 계수 적용): 이전 미끼값 할인 25%(baitDiscount 0.25), 이후 요리 1개마다 추가 완성 확률 10%(extraCookChance 0.1), 보유 유물 합 상한 100%
  - 영향: 미끼 구매가 없어져 저울의 이전 효과는 쓸 곳이 없어졌다. 새 효과는 요리 공급을 늘린다(기운 소비 없이 추가 완성). 되돌리려면 artifacts.ts의 varuna-scale cook 값을 바꾸거나 지운다.
  - 커밋: 1418467c, e9b1fce7, de97ac0f, 1f8c2857, 20736c1a, aaba19ae
- 가방 초과 때 놓아줄 개체의 순서(compareBlandness의 blandTuple)를 바꿨다. 등급 다음 기준을 폼에서 개체 판매가(priceOfInstance, 폼 배수 포함)로 바꿨다. 같은 어종에서는 변이가 일반보다 늦게 나가고, 더 싼 어종의 변이가 더 비싼 어종의 일반보다 먼저 나갈 수 있다.
  서버 빠른 캐치 경로(evictionCandidates)는 게임 계층의 어종 x 폼 판매가표(evictionPriceRows)를 json_to_recordset으로 조인해 (판매가, 크기, uid) 순으로 묶음별 후보를 고른다. 표에 없는 개체(삭제된 어종)의 판매가는 0이다. 클라이언트 비교자와 서버 SQL이 같은 기준을 쓴다.
  밸런스 측정 도구의 방생 순서도 같은 기준으로 맞췄다.
  - 놓아줄 개체 정렬 키: 이전 등급, 폼(일반 먼저, 변이 나중), 크기(미상 먼저), uid, 이후 등급, 개체 판매가(낮은 것 먼저, 폼 배수 포함), 크기(미상 먼저), uid
  - 서버 후보 선정 SQL 정렬: 이전 form asc, size asc nulls first, uid asc, 이후 coalesce(판매가, 0) asc, size asc nulls first, uid asc
  - 영향: 가방 초과 때 같은 등급 안에서 판매가가 높은 개체가 남는다. 놓아주는 개체 수와 등급 순서는 바뀌지 않는다. 되돌리려면 blandTuple의 둘째 키를 폼으로, evictionCandidates의 정렬을 form으로 복원한다.
  - 커밋: 5911f111, 06e22d88, cafb116d

### 수정

- 지원 코드와 의뢰 납품은 한 번만 쓰는 행(reliefs의 활성 코드, bounty_progress의 진행 행)을 소비한다. 이전에는 액션의 읽기 단계에서 그 행을 먼저 소비(코드 비활성화, 진행 행 삭제)하고 규칙을 실행한 뒤 저장을 확정했다. 소비와 확정이 다른 문장이라, 확정이 낙관 락 경합(409 version-conflict)이나 오류로 실패하면 소비만 남고 보상은 저장되지 않았다. 재시도는 이미 소비된 행을 보고 거부됐다. 마지막 릴리즈(v0.18.3)의 서버도 같은 순서다.
  소비를 저장 확정과 함께 일어나게 바꿨다.
  - 지원 코드 소비 시점: 이전 읽기 단계에서 먼저 비활성화, 그 뒤 저장 확정(별도 문장), 이후 규칙 실행 뒤 저장 확정과 같은 트랜잭션. 확정이 실패하면 소비도 되돌려짐
  - 납품 진행 행 소비 시점: 이전 읽기 단계에서 먼저 삭제, 그 뒤 저장 확정(별도 문장), 이후 저장 확정 문장 안에서 삭제. 확정이 어긋나면 행이 남음
  - 커밋: 34f81775, d7ecaf26, 549c7080, fb04208f

### 기타

- 콜롬보항 거점에서 향료전 가구(shop, 미끼 상점)와 shop 스프라이트를 지웠다. 시설 창의 상점 패널(ShopPanel), 미끼 효과 문장(baitEffects), 거점 메뉴의 shop 카드를 지웠다. 미끼 구매 액션(buyBait)과 활성 미끼 액션(setActiveBait)은 액션 스키마에서 빠져 서버가 거부한다. 콜롬보항의 region을 거점 지역 표(BASE_REGION.colombo)에서 읽게 했다.
  - 콜롬보항 시설: 이전 향료전(미끼 상점) 있음, 이후 향료전 없음
  - 커밋: aaba19ae, d6635abf, 1743b311
- 세이브 v8에서 v9로 가는 이관 링크가 이전 미끼 4종의 보유 개수를 정가(LEGACY_BAIT_REFUND)로 골드에 더하고, 그 아이템 행과 activeBait를 지운다. 환불한 것이 있으면 영수증 baitRefund { gold, items }를 남기고 없으면 null이다. 이관은 버전을 올리는 링크라 한 번만 일어난다.
  서버는 저장 blob의 버전을 따라 이관한다(blobInput). 버전이 없는 구 행만 8로 가정한다. 풀 상태 조립, 스칼라 상태, 빠른 캐치 경로와 클라이언트 httpGameGateway가 같은 규칙을 쓴다.
  화면: 영수증이 있으면 미끼 환불 안내 창(BaitRefundModal)을 한 번 띄운다. 순서는 업데이트 소식, 미끼 환불 안내, 튜토리얼이다. 부엌이 열리기 전 배 단계이면 항로 조건 줄을 덧붙인다. 닫으면 dismissBaitRefund 액션이 영수증을 null로 만든다. 게스트도 이 액션은 허용한다.
  - 이전 미끼 환불 정가(1개당): 이전 없음, 이후 일반 25G, 희귀 200G, 영웅 1000G, 전설 2500G
  - 환불 기록: 이전 없음, 이후 세이브 baitRefund 영수증(안내 창을 닫으면 null)
  - 영향: 이전 미끼를 가진 플레이어의 골드가 첫 로드 때 정가만큼 늘고 미끼 보유분은 사라진다. 이관은 세이브에 쓰이므로 코드를 되돌려도 미끼가 복원되지 않는다. 영수증은 안내 창을 닫으면 지워진다.
  - 커밋: aaba19ae, d6635abf, f55ae090, 77d7dc36
- 이메일 가입과 게스트의 이메일 승격 경로를 지웠다. 게임 인증의 이메일과 비밀번호는 가입을 닫고 로그인만 남긴다. 게스트 승격 엔드포인트(api/_auth/upgrade.ts의 anonymousUpgrade)를 삭제했고, 인증 계약(platform/api/types)과 어댑터(httpApi, localApi), accountActions에서 가입을 뺐다. 계정 관리 창의 가입과 승격 흐름도 지웠다.
  기존 이메일 계정은 계정 관리 창의 접는 폼(기존 이메일 계정으로 로그인)으로 로그인하고, 구글을 연결하면 비밀번호 수단이 지워져 그 뒤로는 구글로만 로그인한다.
  - 이메일 가입: 이전 가능(게스트가 이메일과 비밀번호로 승격), 이후 불가. 승격 엔드포인트 삭제, 이메일은 기존 계정 로그인만
  - 커밋: 38e58969, c662c586, 6823479e, a5e30714
- 게스트 계정 정리에 미접속 규칙을 더했다. 진행과 관계없이 마지막 접속이 365일보다 이른 게스트 계정을 지운다. 진행이 없는 게스트를 7일 뒤 지우는 기존 규칙은 그대로다. 구글이나 이메일로 연결된 계정은 익명 표시가 풀려 대상이 아니다.
  마지막 접속은 저장 갱신(구 saves 행의 저장 시각 포함), 세션 사용, 가입 가운데 가장 늦은 시각이다. 정확히 365일 전은 지우지 않는다. 제재된 계정, 관리자 계정, 개발자에게 편지를 보낸 계정은 지우지 않는다. 지우는 범위는 본인 탈퇴와 같다(deleteAccountRows).
  - 진행이 있는 게스트 계정의 자동 삭제: 이전 없음(진행이 없는 게스트만 마지막 활동 7일 뒤 삭제), 이후 마지막 접속이 365일보다 이르면 진행과 관계없이 삭제(제재, 관리자, 편지를 보낸 계정 제외)
  - 영향: 1년 넘게 접속하지 않은 게스트의 계정과 진행이 사라지고 복구할 수 없다.
  - 커밋: 8000bfc7, b876273e

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

## [0.18.1] - 2026-11-10

- 이 버전에 기록된 변경이 없다.

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
- 해역 요구 파워를 조정했다(낚싯대 1레벨당 파워 5). 바뀐 해역은 아래 표와 같다.
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

### UI

- 미확인
  - 커밋: b08f2fb, e37ce66, 1c1bafc, 403705d, b76cb13, dfac321, 146b5c1, 823dd8b, 6b40377, 830fdb2, d8859ae, a407d69, 9df72fa, 8507db6, 3c8cf84, 094abf5, efd729d, 58f7c0d, 60e2092, cd0f9a7, 6167e37, b0846bb, 396f47c, ff13789, 2bdf445, ac8071b, 46c3b1d, 6747222, 241c4e4, 6428925, 95576a7, 13aaf4c, 61f21d4, dbf5baf, 3d87d4f, 19a2eb5, 31cd618, de0aa2a, 228d1e8, 914d3cd, 3de7139, 6997c80, 0675027, 3b2c756, aff140e, 6f3650b, b6f187e, 72ad7c1, 5a694db, dd319ce, 7008a36, 428480a, 6acd4fb, 07aa4b8, 2d881df, 6486636, 32cb451, f31c060, 9b9fdbd, 9c2ecde, f6f7e36, 21c22dc, 67fac35, 83b2edb, e66a5d7, f49c2bd, be64bbc, 9a839b6, f41d2c2, a5a49b0, c31dffb, 3a84f4f, 37f32d6, 8b04f43, de29ffc, 7f63ac4, 57abcf5, 31618ee, 208c74b, 5a7a2d5, 9f1005d, 84522a2, 56620c2, c58697b, 16d86bf, 7a937a4, 9477343, a3a37b2, 6b4f898, 72fbdd6, 47e9646, 85a98af, 8e26c86, c19f18b, 2c9528e, c34ad7b, 3969b34, d4e1916, 715b0bf, d7166bf, e4b75de, 6ec1dc2, 96b434b, 62525ff, af7600c, ca8bc5d, 3b79e0c, 1a049a8, 3714ed4, 2ec850e, 63e8f2e, 8754632, 42bf747, 3feef9f, 1a241f1, 483f22b, 45168a3, f562477, 478e9da, 00db77f, 8f5ba41, 0efc06f, 1db515f, c53fdaa, 10ef3f8, c0d77c6, 6070a35, 0e38254, 94a63c0, 6a069d2, 066e850
- 미확인
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

## [0.15.0] - 2026-11-04

### 기능

- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310
- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310

### UI

- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310

### 기타

- 미확인
  - 커밋: de73d06, a019771, b4fd120, d571ad0, 1ad528d, 30e0b87, d11f497, 99ffc30, ee65bbc, 1342b6d, 0770e3c, aee69bd, aa8665c, 8e0ff71, d9d0080, 38516d8, 819fd94, 3e53310

## [0.14.1] - 2026-11-02

- 이 버전에 기록된 변경이 없다.

## [0.14.0] - 2026-10-23

### 기능

- 미확인
  - 커밋: 672c988, 3a66ed9, 1f49dfc, afe426c, c329491, 0f2cd4f, cb4c932, 4353aa4, f23dbe0, 70ea437, 2e3ece9, 25db6fd, cd21054, 019779e, 1cac0ab
- 미확인
  - 커밋: 672c988, 3a66ed9, 1f49dfc, afe426c, c329491, 0f2cd4f, cb4c932, 4353aa4, f23dbe0, 70ea437, 2e3ece9, 25db6fd, cd21054, 019779e, 1cac0ab
- 미확인
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

## [0.12.1] - 2026-10-19

### 기능

- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
- 미확인
  - 커밋: e5faf7b, 6016743, be830bc, 41a0727, d2381e9, f666109, 4bd6f79, 5bef28a, 8ba952f, bd52989, 17fd934, 2d8c316, 8fc2fbd, 5332ce5, 38ebbbf, db72f57, d6b8e8e, aa40536, 371c878, bdff536, c3be16a, 67f3427, 0912665, 9bcf628, cb50734, 9438891, 04f3c1c, be1fede, 56efa74, 9c88598, de43151, 3a0c03f, 3f5493a, e5be796, 1d1b701
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

## [0.10.5] - 2026-10-17

- 이 버전에 기록된 변경이 없다.

## [0.10.4] - 2026-10-17

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

## [0.10.3] - 2026-10-17

### UI

- 미확인
  - 커밋: 6e08175, 5c902db, 29ff542
- 미확인
  - 커밋: 6e08175, 5c902db, 29ff542

## [0.10.2] - 2026-10-17

### 기능

- 미확인
  - 커밋: bfb5c15, 7fa0277, c87af5b, 6c2d26f, 66fc759, 05b4b7e, 5e19dc8, f205b3f, 0ffe831, 850f8cc, 38ca4b0, eecdeb4, 17aba5b, 15bf78c, df43682, 0489e0d, 3d4ef63, f9185d1

### UI

- 미확인
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

- 이 버전에 기록된 변경이 없다.

## [0.8.2] - 2026-09-06

### 기능

- 미확인
  - 커밋: e34eb9f, 3c0d437, a29d805
- 미확인
  - 커밋: e34eb9f, 3c0d437, a29d805

### UI

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

## [0.7.2] - 2026-09-06

- 이 버전에 기록된 변경이 없다.

## [0.7.1] - 2026-08-27

### 기능

- 미확인
  - 커밋: c3c1b62, 165dacd, 9510852, 48594c1, 8442347
- 미확인
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

## [0.6.1] - 2026-08-25

### 기능

- 미확인
  - 커밋: 7499a30

### 기타

- 미확인
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

## [0.2.3] - 2026-08-21

- 이 버전에 기록된 변경이 없다.

## [0.2.2] - 2026-08-21

### 수정

- 미확인
  - 커밋: f6e85bc

## [0.2.1] - 2026-08-21

- 이 버전에 기록된 변경이 없다.

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

### 기타

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

[0.21.0]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.21.0
[0.20.5]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.20.5
[0.20.4]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.20.4
[0.20.3]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.20.3
[0.20.2]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.20.2
[0.20.1]: https://github.com/abyss-works/pixel-fishing/releases/tag/v0.20.1
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
