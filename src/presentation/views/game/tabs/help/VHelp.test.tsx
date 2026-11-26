// 도움말 탭 — 현재 시스템 안내, 금지 문자·구 정보 배제, 일일 기준 시각 단일 표기, 밸런스 상수 연동, 스포일러 금지를 검증한다.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BOATS, WALK_BAG_CAP } from '../../../../../game/content/boats';
import { BIG_CATCH_PERCENTILE, BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP, CHALLENGE_MISS_LIMIT, VARIANT_PRICE_MULT } from '../../../../../game/rules/balance';
import { TICKET_EXPIRY_TEXT } from '../../../../../game/rules/challenge';
import { GAME_DAY_RESET_TEXT } from '../../../../../game/rules/time';
import VHelp from './VHelp';

afterEach(cleanup);

const renderText = () => {
  const { container } = render(<VHelp />);
  return container.textContent ?? '';
};

describe('VHelp 금지 문자 및 구 정보 제거', () => {
  it('금지 문장부호(·, —, –, →, ↔)와 을(를)을 쓰지 않는다', () => {
    const t = renderText();
    expect(t).not.toMatch(/[·—–→↔]/);
    expect(t).not.toContain('을(를)');
  });

  it('제거된 구 정보와 스포일러, 금지 용어를 포함하지 않는다', () => {
    const t = renderText();
    for (const old of ['도움말 마지막 갱신', '이메일', '비밀번호', '이사 코드', '데이터', '미상', '수주권', '지명 수배', '지명수배', '수역', '군집', '챌린지']) {
      expect(t, old).not.toContain(old);
    }
    for (const spoiler of ['붕어', '크라켄', '메갈로돈', '마리아나 해구']) {
      expect(t, spoiler).not.toContain(spoiler);
    }
  });

  it('정확한 일일 기준 시각은 상수(GAME_DAY_RESET_TEXT, TICKET_EXPIRY_TEXT)로만 표기한다', () => {
    const t = renderText();
    expect(t).toContain(GAME_DAY_RESET_TEXT);
    expect(t).toContain(TICKET_EXPIRY_TEXT);
    // 오늘의 운세/물약/바운티 일일 초기화 1회 + 흔적 만료 상수(TICKET_EXPIRY_TEXT) 1회 외 수동 반복 없음
    expect(t.match(/새벽 4시/g)).toHaveLength(2);
  });
});

describe('VHelp 현행 시스템 안내', () => {
  it('단축키, 메뉴 5탭, 목록과 카드 전환, 보유 중만 보기 토글을 안내한다', () => {
    const t = renderText();
    for (const text of [
      '1~5', 'Tab', 'Shift + Tab', 'Esc', 'Enter', '목록과 카드', '보유 중만 보기',
      'Esc 키를 누르면 열려 있는 메뉴와 창을 위에서부터 차례로 닫고, 열린 창이 없을 때 누르면 집에서는 마을로, 항구에서는 바다로 바로 나갈 수 있어요.',
    ]) {
      expect(t, text).toContain(text);
    }
  });

  it('구글 단일 로그인, 게스트 제한, 현재 설정 메뉴 이름을 안내한다', () => {
    const t = renderText();
    for (const text of ['구글 계정', '게스트', '계정 관리', '내 정보', '닉네임', '물고기 그래픽', '낚을 때 자동 잠금', '코드 입력', '개발자에게', '패치노트', '최근 소식 다시 보기']) {
      expect(t, text).toContain(text);
    }
  });

  it('오늘의 운세와 비약, 바운티 헌팅 새 규칙, 길드·업적·우편함·랭킹 5탭, 여객선·다중 미끼를 안내한다', () => {
    const t = renderText();
    for (const text of [
      '오늘의 운세', '달력', '비약', '일반 의뢰는 항구 진입 시 바로 수주', '네임드 토벌은 전설을 뺀',
      '대상 해역', '의뢰를 포기할 수 있어요',
      '흔적', '결투', '유물', '길드', '업적', '우편함', '랭킹',
      '명성', '도감(일반)', '도감(돌연변이)', '도감(네임드)', '네임드 토벌',
      '자동 잠금', '여객선', '두 칸까지',
    ]) {
      expect(t, text).toContain(text);
    }
  });

  it('밸런스 수치를 상수에서 읽어 표시한다', () => {
    const t = renderText();
    expect(t).toContain(`도보일 때 ${WALK_BAG_CAP}마리`);
    expect(t).toContain(`${BOATS[BOATS.length - 1].bagCap}마리`);
    expect(t).toContain(`상위 ${BIG_CATCH_PERCENTILE}%`);
    expect(t).toContain(`${VARIANT_PRICE_MULT}배 가격`);
    expect(t).toContain(`일반 의뢰 ${BOUNTY_DAILY_CAP}번`);
    expect(t).toContain(`네임드 토벌 ${BOUNTY_NAMED_DAILY_CAP}번`);
    expect(t).toContain(TICKET_EXPIRY_TEXT);
    expect(t).toContain(`도주 ${CHALLENGE_MISS_LIMIT}칸`);
  });
});
