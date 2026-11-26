import { describe, expect, it } from 'vitest';
import {
  PERMISSION_BLOCK_LINES, PERMISSION_LABEL, ALERT_COPY, ALERT_ORDER, BAG_FULL_NOTIFICATION, canAllowPrompt, planAlert, shouldAlertBagFull, shouldShowAlertPrompt,
} from './alerts';

describe('알림 종류와 순서', () => {
  it('세 알림은 네임드 조우, 가방 가득 참, 업데이트 순이다', () => {
    expect(ALERT_ORDER).toEqual(['encounter', 'bag', 'update']);
  });

  it('종류마다 안내 카드 항목, 설정 줄 이름, 설정 줄 설명이 있다', () => {
    expect(ALERT_ORDER.map(k => ALERT_COPY[k].prompt)).toEqual(['네임드와 조우했을 때', '가방이 가득 찼을 때', '업데이트가 나왔을 때']);
    expect(ALERT_ORDER.map(k => ALERT_COPY[k].label)).toEqual(['네임드 조우', '가방 가득 참', '업데이트']);
    expect(ALERT_COPY.bag.hint).toBe('가방이 가득 차면 알려 줘요.');
  });

  it('가방 가득 참 시스템 알림과 탭 제목 문구', () => {
    expect(BAG_FULL_NOTIFICATION).toEqual({ title: '가방 가득 참', body: '가방이 가득 찼어요. 돌아와서 가방을 비워 주세요.' });
    expect(ALERT_COPY.bag.flash).toBe('가방 가득 참');
  });
});

describe('권한 문안', () => {
  it('상태 꼬리표는 허용됨, 허용 전, 차단됨, 지원 안 함이다', () => {
    expect(PERMISSION_LABEL).toEqual({ granted: '허용됨', default: '허용 전', denied: '차단됨', unsupported: '지원 안 함' });
  });

  it('차단 안내는 문장마다 한 줄이고 탭 제목 깜빡임을 알린다 - 허용됨과 허용 전에는 이유가 없다', () => {
    expect(PERMISSION_BLOCK_LINES.denied).toHaveLength(3);
    expect(PERMISSION_BLOCK_LINES.denied?.[2]).toBe('그동안은 탭 제목 깜빡임으로 알려 줘요.');
    expect(PERMISSION_BLOCK_LINES.unsupported).toEqual(['이 브라우저는 알림을 지원하지 않아요.', '대신 탭 제목 깜빡임으로 알려 줘요.']);
    expect(PERMISSION_BLOCK_LINES.granted).toBeUndefined();
    expect(PERMISSION_BLOCK_LINES.default).toBeUndefined();
  });
});

describe('알림 여부', () => {
  const base = { pageHidden: true, enabled: true, permission: 'granted' as const };

  it('화면을 보고 있으면 아무것도 하지 않는다 — 토스트와 안내 카드로 충분하다', () => {
    expect(planAlert({ ...base, pageHidden: false })).toEqual({ flash: false, notify: false });
  });

  it('다른 화면을 보고 있으면 제목을 깜빡이고, 켜 두고 허용했으면 시스템 알림도 띄운다', () => {
    expect(planAlert(base)).toEqual({ flash: true, notify: true });
  });

  it('알림을 끄거나 권한이 없으면 제목만 깜빡인다', () => {
    expect(planAlert({ ...base, enabled: false })).toEqual({ flash: true, notify: false });
    for (const permission of ['default', 'denied', 'unsupported'] as const) {
      expect(planAlert({ ...base, permission })).toEqual({ flash: true, notify: false });
    }
  });
});

describe('안내 카드를 띄울 조건', () => {
  const base = { permission: 'default' as const, seen: false, offs: 0 };

  it('권한을 아직 묻지 않았고, 본 적 없고, 끈 알림이 없으면 띄운다', () => {
    expect(shouldShowAlertPrompt(base)).toBe(true);
  });

  it('이미 허용·거절했거나 브라우저가 지원하지 않으면 띄우지 않는다', () => {
    for (const permission of ['granted', 'denied', 'unsupported'] as const) {
      expect(shouldShowAlertPrompt({ ...base, permission })).toBe(false);
    }
  });

  it('본 적이 있으면 띄우지 않는다', () => {
    expect(shouldShowAlertPrompt({ ...base, seen: true })).toBe(false);
  });

  it('직접 끈 알림이 하나라도 있으면 띄우지 않는다', () => {
    expect(shouldShowAlertPrompt({ ...base, offs: 1 })).toBe(false);
  });
});

describe('안내 카드 허용 버튼', () => {
  it('하나라도 켜 두었을 때만 누를 수 있다', () => {
    expect(canAllowPrompt({ encounter: true, bag: true, update: true })).toBe(true);
    expect(canAllowPrompt({ encounter: false, bag: true, update: false })).toBe(true);
    expect(canAllowPrompt({ encounter: false, bag: false, update: false })).toBe(false);
  });
});

describe('가방 가득 참 알림 판정', () => {
  const base = { wasFull: false, full: true, pageHidden: true, alreadyAlerted: false };

  it('자리를 비운 동안 가방이 가득 차는 순간 알린다', () => {
    expect(shouldAlertBagFull(base)).toBe(true);
  });

  it('이미 가득 차 있었거나 아직 가득 차지 않았으면 알리지 않는다', () => {
    expect(shouldAlertBagFull({ ...base, wasFull: true })).toBe(false);
    expect(shouldAlertBagFull({ ...base, full: false })).toBe(false);
  });

  it('게임 화면을 보고 있으면 알리지 않는다', () => {
    expect(shouldAlertBagFull({ ...base, pageHidden: false })).toBe(false);
  });

  it('돌아오기 전에 이미 알렸으면 다시 알리지 않는다', () => {
    expect(shouldAlertBagFull({ ...base, alreadyAlerted: true })).toBe(false);
  });
});
