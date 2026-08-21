import { PATCH_NOTES } from '../data/patchnotes';
import { cx } from '../ui/cx';
import Accordion from '../ui/Accordion';
import SectionTitle from '../ui/SectionTitle';

// 노트 범주 뱃지 색 — UI=하늘, 기능=골드, 그 외=낮은 톤
const TAG_CLS: Record<string, string> = {
  UI: 'text-accent border-accent',
  기능: 'text-gold border-[#c9a227]',
};

// 패치노트 콘텐츠 — Sidebar의 '설정' 탭에서 렌더. 데이터는 data/patchnotes.ts (배포와 함께 버전됨)
// 버전별 아코디언: 기본은 전부 닫힘, 노트마다 범주(UI/기능/기타) 뱃지를 단다.
export default function PatchNotesPanel() {
  return (
    <div>
      <SectionTitle>업데이트 소식</SectionTitle>
      <div className="flex flex-col gap-2">
        {PATCH_NOTES.map(p => (
          <Accordion
            key={p.version}
            summary={
              <>
                <span className="pf-accent">v{p.version}</span>
                <span className="flex-1 text-text-dim overflow-hidden text-ellipsis whitespace-nowrap">{p.summary}</span>
                <span className="text-text-dim text-[10px]">{p.date}</span>
              </>
            }
          >
            <ul className="list-none px-2 pb-2 flex flex-col gap-1 text-xs leading-[1.6]">
              {p.notes.map((n, i) => (
                <li key={i}>
                  <span className={cx(
                    'inline-block text-[10px] px-1 mr-1 rounded-sm border align-[1px] whitespace-nowrap',
                    TAG_CLS[n.tag] ?? 'text-text-dim border-line',
                  )}>{n.tag}</span>
                  {n.text}
                </li>
              ))}
            </ul>
          </Accordion>
        ))}
      </div>
    </div>
  );
}
