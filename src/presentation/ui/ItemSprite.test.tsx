import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ItemSprite from './ItemSprite';

describe('ItemSprite', () => {
  it('potion 종류 스프라이트를 캔버스로 렌더링한다', () => {
    const { container } = render(<ItemSprite kind="potion" id="luck-small" preset="list" ariaLabel="작은 행운 물약" />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('aria-label')).toBe('작은 행운 물약');
  });

  it('없는 id는 렌더링하지 않는다', () => {
    const { container } = render(<ItemSprite kind="potion" id="missing-potion" preset="row" />);
    expect(container.querySelector('canvas')).toBeNull();
  });
});
