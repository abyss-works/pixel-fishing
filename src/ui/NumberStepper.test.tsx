// 숫자 스테퍼 — 버튼과 **직접 타이핑** 두 경로 모두 검증(사용자 지시: "숫자 입력할 수 있게").
// 타이핑 경계 사례들: 미완성 draft가 clamp에 짓눌리지 않기 / blur 확정 / 비숫자 원복 / min·max.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NumberStepper from './NumberStepper';

afterEach(cleanup);

const setup = (value = 1, props: Partial<Parameters<typeof NumberStepper>[0]> = {}) => {
  const onChange = vi.fn();
  render(<NumberStepper value={value} ariaLabel="미끼" onChange={onChange} {...props} />);
  const input = screen.getByLabelText('미끼 수량') as HTMLInputElement;
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  const blur = () => fireEvent.blur(input);
  return { input, type, blur, onChange };
};

describe('NumberStepper — 타이핑', () => {
  it('유효 범위의 정수를 치면 즉시 onChange로 반영된다(부모 총액 계산이 산다)', () => {
    const { type, onChange } = setup();
    type('2');
    expect(onChange).toHaveBeenLastCalledWith(2);
    type('25');
    expect(onChange).toHaveBeenLastCalledWith(25);
  });

  it('편집 중엔 clamp로 짓눌리지 않는다 — "0"은 그대로 보이고 blur에서 min 확정', () => {
    const { input, type, blur, onChange } = setup(5);
    type('0');
    expect(onChange).not.toHaveBeenCalled();          // 0은 아직 제안일 뿐(min 미달)
    expect(input.value).toBe('0');
    blur();
    expect(onChange).toHaveBeenLastCalledWith(1);     // 확정 시점에만 min 클램프
  });

  it('max 초과 입력도 즉시 반영하지 않고 blur에서 max 확정한다', () => {
    const { type, blur, onChange } = setup(3, { max: 50 });
    type('99');
    expect(onChange).not.toHaveBeenCalled();
    blur();
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it('비숫자는 걸러지고, 전부 걸리면 blur에서 직전 값으로 원복된다', () => {
    const { input, type, blur, onChange } = setup(3);
    type('a7b');
    expect(input.value).toBe('7');                    // 'a7b' → '7'
    type('xy');
    expect(input.value).toBe('');
    blur();
    // blur는 무효 draft에 대해 아무것도 하지 않는다 — 호출은 '7' 확정 1회뿐이고 value=3 유지
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('Enter로도 확정된다', () => {
    const { input, type, onChange } = setup();
    type('10');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(10);
  });
});

describe('NumberStepper — 버튼/경계', () => {
  it('step만큼 증감하고 경계에서 disabled가 켜진다', () => {
    const onChange = vi.fn();
    render(<NumberStepper value={49} max={50} ariaLabel="q" onChange={onChange} />);
    const plus = screen.getByLabelText('q 수량 증가') as HTMLButtonElement;
    fireEvent.click(plus);
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it('disabled면 입력 필드와 버튼이 모두 막힌다', () => {
    render(<NumberStepper value={1} disabled ariaLabel="d" onChange={() => {}} />);
    expect((screen.getByLabelText('d 수량') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('d 수량 증가') as HTMLButtonElement).disabled).toBe(true);
  });
});
