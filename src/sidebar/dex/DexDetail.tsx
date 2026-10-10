import { useState } from 'react';
import {
  dexRecord, formName, priceOf, sizeParams, sizePercentile,
} from '../../game/logic';
import type { Fish, GameState } from '../../game/logic';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import FishSprite from '../../ui/FishSprite';
import { RarityText, RarityDot } from '../../ui/RarityTag';

// 도감 상세보기 — 위(초상화, 좌우 화살표로 기본형/변이 전환) + 아래(정보) 2단 구성.
// 변이는 "종만 같고 다른 개체" (v0.3.3): 폼을 전환하면 이름/로어/가격/마릿수/크기/첫 조우일이
// 전부 그 폼의 것으로 바뀐다. 등급·형태·크기 분포만 종에 종속.
export default function DexDetail({ fish, game, initialForm = 0, onClose }: {
  fish: Fish; game: GameState; initialForm?: number; onClose: () => void;
}) {
  // forms[0] = 기본형 · forms[1+] = 변이(발견해야 정보 공개). 배열인 이유: 폼이 늘어도
  // 화살표 로직 그대로. 크기 폴백 = 분포 평균(상위 50%) — 기록 없는 이관 개체 대응.
  const forms = (['normal', 'variant'] as const).map(form => {
    const rec = dexRecord(game, fish.id, form);
    return {
      form,
      name: formName(fish, form),
      lore: form === 'variant' ? fish.variant.lore : fish.lore,
      discovered: (rec?.count ?? 0) > 0, // 폼별 — 변이만 잡았으면 일반 폼은 여전히 ???
      count: rec?.count ?? 0,
      maxSize: rec?.maxSize ?? sizeParams(fish).mean,
      firstCaught: rec?.first ?? undefined,
    };
  });
  const [i, setI] = useState(initialForm);
  const form = forms[i];
  const arrowCls = 'bg-surface-2 border border-line rounded-sm text-text text-base px-1 py-2 cursor-pointer hover:bg-line';

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-center gap-2">
        <button className={arrowCls} aria-label="이전 형태"
                onClick={() => setI((i - 1 + forms.length) % forms.length)}>◀</button>
        <div>
          <FishSprite fish={fish} preset="portrait" form={form.form} discovered={form.discovered}
                      ariaLabel={form.discovered ? fish.name : '미확인 변종'} className="block" />
          <p className="text-center text-text-dim text-sm mt-1">{form.discovered ? form.name : '???'}</p>
        </div>
        <button className={arrowCls} aria-label="다음 형태"
                onClick={() => setI((i + 1) % forms.length)}>▶</button>
      </div>

      <div className="mt-3">
        {/* 미발견 폼도 같은 구조로 렌더 (값만 ??? 마스킹) — 폼 전환 시 레이아웃 점프 방지 */}
        <h3 className="text-lg text-gold mb-2">{form.discovered ? form.name : '???'}{' '}
          <RarityDot rarity={fish.rarity} /><RarityText rarity={fish.rarity} /></h3>
        <p className="text-text-dim italic text-sm mt-1 mb-3">
          {form.discovered ? form.lore : '…아직 만나지 못한 개체다. 어딘가에서 헤엄치고 있을 것이다.'}
        </p>
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm mb-2">
          <span className="text-text-dim">가격</span>
          <span className="pf-accent">{form.discovered ? `${priceOf(fish, form.form)}G` : '???'}</span>
          <span className="text-text-dim">잡은 수</span>
          <span>{form.discovered ? `${form.count}마리` : '???'}</span>
          <span className="text-text-dim">최대 크기</span>
          <span>{form.discovered
            ? <>{form.maxSize.toFixed(1)}cm <span className="text-text-dim text-xs">(상위 {sizePercentile(fish, form.maxSize)}%)</span></>
            : '???'}</span>
          <span className="text-text-dim">처음 만난 날</span>
          <span>{form.discovered ? (form.firstCaught ?? '알 수 없음') : '???'}</span>
        </div>
        <Button onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
