// 스테이지 모달 투명 래퍼 — 배치만 맡고 스크롤 클래스를 갖지 않는다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Modal from './Modal';
import type { ModalHeight } from './Modal';

/** 스크롤을 거는 모든 표기 — 공용 스크롤 클래스, overflow 유틸, arbitrary 표기(`[overflow-y:auto]`), 인라인 style 객체 */
const OVERFLOW_DIRECT = /\boverflow-(?:x-|y-)?(?:auto|scroll)\b|\[overflow(?:-x|-y)?:(?:auto|scroll)\]|\boverflow(?:X|Y)?\s*:\s*['"`](?:auto|scroll)['"`]/;
const SCROLL_CLASS = new RegExp(`pf-vscroll|pf-scroll|${OVERFLOW_DIRECT.source}`);

describe('스테이지 모달 래퍼', () => {
  afterEach(cleanup);
  // 래퍼에 합쳐지는 클래스(높이 상수 포함)를 정규식으로 읽지 않고, 높이·폭 변형을 모두 렌더해 실제 class를 본다
  const heights: (ModalHeight | undefined)[] = [undefined, 400, 480, 520, 560];
  const widths: Array<{ sm?: boolean; md?: boolean; xl?: boolean }> = [{}, { sm: true }, { md: true }, { xl: true }];

  it('모든 높이·폭 변형에서 스크롤 클래스를 갖지 않는다 — 스크롤은 카드 본문이 맡는다', () => {
    const classes: string[] = [];
    for (const height of heights) {
      for (const width of widths) {
        for (const mobileFixed of [false, true]) {
          render(
            <Modal layer="stage" height={height} mobileFixed={mobileFixed} onClose={() => {}} {...width}>
              <p>내용</p>
            </Modal>,
          );
          classes.push(screen.getByRole('dialog').className);
          cleanup();
        }
      }
    }
    expect(classes).toHaveLength(heights.length * widths.length * 2);
    expect(classes.filter(c => SCROLL_CLASS.test(c))).toEqual([]);
  });

  it('모바일 고정 변형은 모바일 높이를 가용 높이로 정하고 내용 높이(mobile:h-auto)를 쓰지 않는다', () => {
    for (const height of [480, 520, 560] as const) {
      render(
        <Modal layer="stage" height={height} mobileFixed onClose={() => {}}>
          <p>내용</p>
        </Modal>,
      );
      const cls = screen.getByRole('dialog').className;
      cleanup();
      expect(cls).toContain('mobile:h-[calc(100%-48px)]');
      expect(cls).not.toContain('mobile:h-auto');
    }
  });

  it('감지: 높이 상수에 스크롤 클래스가 섞이면 잡는다', () => {
    expect(SCROLL_CLASS.test('h-[min(480px,calc(100%-32px))] overflow-y-auto')).toBe(true);
    expect(SCROLL_CLASS.test('h-[min(480px,calc(100%-32px))] pf-vscroll')).toBe(true);
    expect(SCROLL_CLASS.test('h-[min(480px,calc(100%-32px))] mobile:h-auto')).toBe(false);
  });
});
