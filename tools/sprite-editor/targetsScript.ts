// 에디터 페이지가 불러오는 대상 정의 스크립트의 원문. 에디터는 서버와 번들러 없이 열리므로
// 대상 정의를 직접 import하지 못한다. 정의를 이 스크립트로 옮겨 싣는다.
import { OUTLINE_DARK, SILHOUETTE } from '../../src/game/content/sprites/common';
import { SPRITE_TARGETS } from '../../src/game/content/sprites/targets';

export function targetsScript(): string {
  const data = { outline: OUTLINE_DARK, silhouette: SILHOUETTE, targets: SPRITE_TARGETS };
  return `// 생성 파일 — 손으로 고치지 않는다. 대상 정의에서 다시 만들려면: pnpm exec tsx tools/sprite-editor/build-targets.ts
window.SPRITE_EDITOR_DATA = ${JSON.stringify(data, null, 2)};
`;
}
