import type { ReactNode } from 'react';
import {
  BIG_CATCH_PERCENTILE, BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP, CHALLENGE_MISS_LIMIT, VARIANT_PRICE_MULT,
} from '../../../../../game/rules/balance';
import { GAME_DAY_RESET_TEXT } from '../../../../../game/rules/time';
import { TICKET_EXPIRY_TEXT } from '../../../../../game/rules/challenge';
import { variantShare } from '../../../../../game/rules/logic';
import { BOATS, WALK_BAG_CAP } from '../../../../../game/content/boats';
import { SLOT_SCOPE } from '../../../../../features/kitchen/model/recipes';
import Accordion from '../../../../ui/Accordion';
import { HighlightRarityText, RarityText } from '../../../../ui/fish/RarityTag';
import Note from '../../../../ui/Note';
import PixelList from '../../../../ui/PixelList';
import SectionTitle from '../../../../ui/SectionTitle';

// 도움말 화면 — 게임 탭의 도움말에서 시스템 전반의 조작과 규칙만 짧게 안내한다.
// 구역 정보와 어종은 지역 탭 소관이며, 네임드와 밤 어종의 실명은 스포일러라 쓰지 않는다.
function Topic({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Accordion summary={
      <>
        <span className="text-gold">{title}</span>
        <span className="flex-1 text-text-dim text-xs overflow-hidden text-ellipsis whitespace-nowrap">
          {hint}
        </span>
      </>
    }>
      <div className="px-2 pb-2">{children}</div>
    </Accordion>
  );
}

export default function VHelp() {
  return (
    <div>
      <SectionTitle>처음이라면</SectionTitle>
      <PixelList>
        <li>실패와 페널티가 없는 느긋한 낚시 게임이에요.</li>
        <li><b>방향키</b> 또는 <b>WASD</b>로 움직이고 <b>스페이스</b>나 화면 누르기로 낚시해요.</li>
        <li>물고기가 모인 <b>어군</b> 곁에서 스페이스를 누르면 찌를 던지고, 가만히 두어도 잡혀요.</li>
        <li>집이나 항구에서 시설을 눌러 물고기를 팔고 장비를 정비해요.</li>
      </PixelList>
      <Note>여기까지만 알아도 충분해요. 아래는 궁금해질 때 펼쳐 보세요.</Note>

      <SectionTitle>더 알아보기</SectionTitle>
      <div className="flex flex-col gap-2">
        <Topic title="화면과 조작" hint="메뉴 탭, 키보드 단축키">
          <PixelList>
            <li>메뉴는 <b>지역</b>, <b>가방</b>, <b>도감</b>, <b>도움말</b>, <b>설정</b> 다섯 탭으로 나뉘어요.</li>
            <li><b>1~5</b>로 메뉴 탭을 열고, 가방과 도감을 한 번 더 누르면 보기가 차례로 바뀌어요.</li>
            <li><b>Tab</b>과 <b>Shift + Tab</b>으로 가방의 물고기, 아이템, 유물과 도감의 구역을 순환해요.</li>
            <li><b>Esc</b>로 떠 있는 창을 닫고, <b>Enter</b>로 채팅 입력 줄에 들어가요.</li>
            <li>가방 물고기 오른쪽 위 아이콘으로 <b>목록과 카드</b> 보기를 전환해요.</li>
            <li>가방 아이템과 유물에서는 <b>보유 중만 보기</b> 토글로 가진 것만 추려 봐요.</li>
            <li>오른쪽 위 메뉴에 <b>의뢰</b>, <b>업적</b>, <b>길드</b>, <b>소셜</b>, <b>우편함</b> 창이 있어요.</li>
            <li>집과 항구의 <b>게시판</b>에서 <HighlightRarityText text="명성, 도감(일반), 도감(돌연변이), 도감(네임드), 네임드 토벌" /> 다섯 탭으로 <b>랭킹</b>을 봐요.</li>
          </PixelList>
        </Topic>

        <Topic title="낚시와 타이밍" hint="GOOD, PERFECT, 방치 낚시">
          <PixelList>
            <li>찌를 던지고 기다려 느낌표가 뜨면 타이밍 바가 나타나요.</li>
            <li>커서가 <b>노란 영역</b>에 있을 때 누르면 <b>GOOD</b>, 가운데 <b>빨간 영역</b>에서는 <b>PERFECT</b>예요.</li>
            <li>아무것도 누르지 않으면 바 끝에서 자동으로 잡히는 방치 낚시가 이어져요.</li>
            <li><HighlightRarityText text="요구 파워를 넘긴 뒤에도 낚싯대를 강화할수록 방치 낚시에서 희귀한 물고기가 더 잘 걸려요." /></li>
            <li>요구 파워에 못 미치면 입질이 느려지며, 세부 수치는 자원 바를 눌러 여는 <b>스탯 창</b>에서 확인해요.</li>
            <li>낚시 중에 이동하면 찌를 거두고 바로 움직여요.</li>
          </PixelList>
        </Topic>

        <Topic title="물고기" hint="등급, 월척, 돌연변이">
          <PixelList>
            <li><b><RarityText rarity="common" /></b>부터 <b><RarityText rarity="legendary" /></b>까지 등급이 높을수록 비싸게 팔리고 명성이 크게 올라요.</li>
            <li>같은 어종 중 크기 <b>상위 {BIG_CATCH_PERCENTILE}%</b>면 <b>월척</b>이며, 최고 기록은 팔아도 도감에 남아요.</li>
            <li>잡을 때마다 {Math.round(variantShare() * 100)}% 확률로 색이 다른 <b><HighlightRarityText text="돌연변이" /></b>가 나오며 <b>{VARIANT_PRICE_MULT}배 가격</b>에 팔려요.</li>
            <li><HighlightRarityText text="도감의 각 보기에서 일반, 돌연변이, 네임드 기록을 따로 모아 봐요." /></li>
          </PixelList>
        </Topic>

        <Topic title="바다와 항해" hint="구역, 여객선, 세계지도">
          <PixelList>
            <li>바다는 여러 <b>구역</b>으로 나뉘며, 먼 구역으로 가려면 그에 맞는 <b>배</b>가 필요해요.</li>
            <li>항구에서는 물고기를 팔고 정비하며, <b>여객선</b>으로 열린 항구와 마을을 빠르게 이동해요.</li>
            <li>미니맵을 누르면 <b>세계지도</b>가 열려 갈 수 있는 구역과 못 가는 구역을 보여 줘요.</li>
          </PixelList>
        </Topic>

        <Topic title="낮과 밤" hint="하루의 흐름, 밤 물고기">
          <PixelList>
            <li>현실 시간 한 시간이 게임 속 하루이며, 칩 줄의 <b>시계</b>로 낮과 밤을 봐요.</li>
            <li>밤에는 바다가 어두워지고 이동이 조금 느려지며 밤에만 나오는 물고기도 있어요.</li>
          </PixelList>
        </Topic>

        <Topic title="오늘의 운세와 비약" hint="운세 창, 달력, 비약">
          <PixelList>
            <li>매일 처음 접속하면 <b>오늘의 운세</b> 창이 뜨고, 달력과 스탯 창 보너스 탭에서도 오늘 효과를 봐요.</li>
            <li>가방 아이템에서 <b>비약</b>을 사용하면 하루 동안 모든 행운 효과가 올라요.</li>
            <li>오늘의 운세, 비약, 바운티 헌팅의 하루는 <b>{GAME_DAY_RESET_TEXT}</b>에 새로 시작해요.</li>
          </PixelList>
        </Topic>

        <Topic title="바운티 헌팅" hint="수배판, 일반 의뢰, 네임드 토벌, 유물">
          <PixelList>
            <li>항구의 <b>수배판</b>에서 <b>일반 의뢰는 항구 진입 시 바로 수주</b>하고, 목표를 채운 뒤 완료를 눌러 골드를 받아요.</li>
            <li><b><HighlightRarityText text="네임드 토벌은 전설을 뺀" /></b> 그 구역 도감을 모두 채우면 열리며, 수주 뒤 낚시하다 드물게 조우해요.</li>
            <li>하루에 일반 의뢰 {BOUNTY_DAILY_CAP}번, <HighlightRarityText text="네임드 토벌" /> {BOUNTY_NAMED_DAILY_CAP}번 클리어하며, 메뉴 줄 <b>의뢰</b> 배지에서 남은 횟수를 봐요.</li>
            <li>일반 의뢰는 수주 뒤 잡은 물고기만 세고 가방에 그대로 남으며, 조건을 채운 의뢰는 날짜가 지나도 보상을 받아요.</li>
            <li><HighlightRarityText text="네임드를 만나면" /> <b>흔적</b> 카드가 {TICKET_EXPIRY_TEXT} 남고, 추적 뒤 조우를 누르면 결투가 시작돼요.</li>
            <li>결투에서는 금색 칸에 맞춰 챔질해 체력을 깎고, 도주 {CHALLENGE_MISS_LIMIT}칸이 차기 전에 이겨야 해요.</li>
            <li>토벌 보상으로 받은 재료는 수배판에서 지니기만 해도 효과가 이어지는 <b>유물</b>로 바꿔요.</li>
          </PixelList>
        </Topic>

        <Topic title="가방과 요리" hint="자물쇠, 자동 잠금, 기운 얻기, 미끼">
          <PixelList>
            <li><b>자물쇠</b>로 잠근 물고기는 팔리거나 가방 정리에서 놓아지지 않아요.</li>
            <li><b>자동 잠금</b>은 <HighlightRarityText text="어종과 돌연변이별 가장 큰 한 마리만 남기고 나머지 잠금은 풀어요." /></li>
            <li>가방 용량은 도보일 때 <b>{WALK_BAG_CAP}마리</b>부터 가장 좋은 배의 <b>{BOATS[BOATS.length - 1].bagCap}마리</b>까지 늘어요.</li>
            <li>가득 찬 채 더 낚으면 가장 평범한 물고기부터 놓아주지만 명성과 도감 기록은 남아요.</li>
            <li>집 궤짝이나 항구 어시장의 <b>기운 얻기</b>로 생명의 기운을 얻고, 집 부엌에서 요리해요.</li>
            <li>가방에서 도시락을 사용하면 {SLOT_SCOPE.lunch}, 미끼를 사용하면 {SLOT_SCOPE.bait} 효과가 켜져요.</li>
            <li>일부 유물을 지니면 미끼를 <b>두 칸까지</b> 함께 쓸 수 있어요.</li>
          </PixelList>
        </Topic>

        <Topic title="성장과 커뮤니티" hint="명성, 낚싯대, 길드, 업적, 우편함">
          <PixelList>
            <li>물고기를 잡을 때마다 쌓이는 <b>명성</b>은 소모되지 않고 더 좋은 배를 살 자격 조건이 돼요.</li>
            <li><b>낚싯대</b>는 골드로 강화해 입질 속도와 파워를 높이고, <b>배</b>는 먼 구역과 넓은 가방을 열어요.</li>
            <li><b>길드</b>에 가입해 기여를 쌓으면 길드 보너스와 개인 자유 강화로 추가 효과를 얻어요.</li>
            <li><b>업적</b>을 달성하면 보상과 누적 보너스를 받고, <b>우편함</b>에서 골드와 아이템을 받아요.</li>
          </PixelList>
        </Topic>

        <Topic title="계정과 설정" hint="구글 계정, 내 정보, 설정, 패치노트">
          <PixelList>
            <li>진행은 서버에 바로 저장되며, <b>구글 계정</b>을 연결하면 다른 기기에서도 이어서 플레이해요.</li>
            <li><b>게스트</b>는 마을 안에서만 활동할 수 있고 바다로 출항하거나 다른 기기로 이어할 수 없어요.</li>
            <li>설정 탭의 <b>계정 관리</b>에서 구글 로그인과 로그아웃을 하고, <b>내 정보</b>에서 <b>닉네임</b>을 바꿔요.</li>
            <li>설정 탭의 <b>설정</b>에서 <b>물고기 그래픽</b>, <b>낚을 때 자동 잠금</b>, 알림을 고르고, <b>코드 입력</b>과 <b>개발자에게</b>를 써요.</li>
            <li>업데이트 안내가 뜨면 <b>새로고침</b>하고, 지난 소식은 <b>패치노트</b>의 <b>최근 소식 다시 보기</b>로 열어요.</li>
          </PixelList>
        </Topic>
      </div>
    </div>
  );
}
