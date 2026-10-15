import { cx } from './cx';

// 패치노트 범주 뱃지 — 기능=골드, UI=하늘, 밸런스=에픽, 그 외=낮은 톤.
// 설정 탭의 업데이트 소식 목록과 접속 시 소식 창이 같은 색을 쓴다.
const TAG_CLS: Record<string, string> = {
  기능: 'text-gold border-gold-dark',
  UI: 'text-accent border-accent',
  밸런스: 'text-epic border-epic',
};

export default function NoteTag({ tag, className }: { tag: string; className?: string }) {
  return (
    <span className={cx(
      'inline-block text-2xs px-1 rounded-sm border align-[1px] whitespace-nowrap',
      TAG_CLS[tag] ?? 'text-text-dim border-line',
      className,
    )}>{tag}</span>
  );
}
