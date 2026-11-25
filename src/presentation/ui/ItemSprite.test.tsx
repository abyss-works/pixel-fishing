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

  it('artifact 종류 스프라이트를 row·list·hero 프리셋 크기로 렌더링한다', () => {
    const r = render(<ItemSprite kind="artifact" id="wreck-compass" preset="row" />);
    expect(r.container.querySelector('canvas')).toHaveAttribute('width', '16');
    r.rerender(<ItemSprite kind="artifact" id="wreck-compass" preset="list" />);
    expect(r.container.querySelector('canvas')).toHaveAttribute('width', '32');
    r.rerender(<ItemSprite kind="artifact" id="wreck-compass" preset="hero" />);
    expect(r.container.querySelector('canvas')).toHaveAttribute('width', '48');
  });

  it('없는 id는 렌더링하지 않는다', () => {
    const { container } = render(<ItemSprite kind="potion" id="missing-potion" preset="row" />);
    expect(container.querySelector('canvas')).toBeNull();
  });
});
