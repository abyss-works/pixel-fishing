import { PATCH_NOTES } from './data/patchnotes';

// 패치노트 콘텐츠 — Sidebar의 '설정' 탭에서 렌더. 데이터는 data/patchnotes.ts (배포와 함께 버전됨)
// 버전별 아코디언: 기본은 전부 닫힘, 노트마다 범주(UI/기능/기타) 뱃지를 단다.
export default function PatchNotesPanel() {
  return (
    <div className="patchnotes">
      <h4>업데이트 소식</h4>
      {PATCH_NOTES.map(p => (
        <details key={p.version} className="patch-acc">
          <summary>
            <span className="pf-accent">v{p.version}</span>
            <span className="patch-summary">{p.summary}</span>
            <span className="cnt">{p.date}</span>
          </summary>
          <ul className="patch-list">
            {p.notes.map((n, i) => (
              <li key={i}>
                <span className="patch-tag" data-tag={n.tag}>{n.tag}</span>
                {n.text}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
