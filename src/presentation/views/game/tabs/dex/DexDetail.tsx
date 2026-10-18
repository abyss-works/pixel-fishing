import { useState } from 'react';
import type { Fish, GameState } from '../../../../../game/rules/logic';
import { selectDexDetailData } from '../../../../../features/dex/model/catalog';
import { useSpeciesRanking } from '../../../../../features/ranking/service/useRanking';
import RankList from '../../../../ui/RankList';
import Subheading from '../../../../ui/Subheading';
import RankingStatus from '../../../overlays/ranking/RankingStatus';
import ArrowButton from '../../../../ui/ArrowButton';
import Modal from '../../../../ui/Modal';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RarityText, RarityDot } from '../../../../ui/fish/RarityTag';
import PageTitle from '../../../../ui/PageTitle';
import { fmtGold, fmtSize } from '../../../../ui/format';

// 도감 상세보기 — 위(초상화, 좌우 화살표로 기본형/변이 전환) + 아래(정보) 2단 구성.
// 변이는 "종만 같고 다른 개체" (v0.3.3): 폼을 전환하면 이름/로어/가격/마릿수/크기/첫 조우일이
// 전부 그 폼의 것으로 바뀐다. 등급·형태·크기 분포만 종에 종속.
export default function DexDetail({ fish, game, initialForm = 0, onClose }: {
  fish: Fish; game: GameState; initialForm?: number; onClose: () => void;
}) {
  // forms[0] = 기본형 · forms[1+] = 변이(발견해야 정보 공개). 배열인 이유: 폼이 늘어도
  // 화살표 로직 그대로. 크기 폴백 = 분포 평균(상위 50%) — 기록 없는 이관 개체 대응.
  const forms = selectDexDetailData(game, fish);
  const [i, setI] = useState(initialForm);
  const form = forms[i];
  // 어종 크기 순위 — 폼과 무관하게 어종 단위다. 랭킹이 없는 로컬 모드에서는 구역을 숨긴다
  const ranking = useSpeciesRanking(fish.id);

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-center gap-2">
        <ArrowButton dir={-1} tone="solid" aria-label="이전 형태"
                onClick={() => setI((i - 1 + forms.length) % forms.length)} />
        <div>
          <FishSprite fish={fish} preset="portrait" form={form.form} discovered={form.discovered}
                      animate={form.discovered}
                      ariaLabel={form.discovered ? fish.name : '미확인 변종'} className="block" />
          <p className="text-center text-text-dim text-sm mt-1">{form.discovered ? form.name : '???'}</p>
        </div>
        <ArrowButton dir={1} tone="solid" aria-label="다음 형태"
                onClick={() => setI((i + 1) % forms.length)} />
      </div>

      <div className="mt-3">
        {/* 미발견 폼도 같은 구조로 렌더 (값만 ??? 마스킹) — 폼 전환 시 레이아웃 점프 방지 */}
        <PageTitle className="mb-2">{form.discovered ? form.name : '???'}{' '}
          <RarityDot rarity={fish.rarity} /><RarityText rarity={fish.rarity} /></PageTitle>
        <p className="text-text-dim italic text-sm mt-1 mb-3">
          {form.discovered ? form.lore : '…아직 만나지 못한 개체다. 어딘가에서 헤엄치고 있을 것이다.'}
        </p>
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm mb-2">
          <span className="text-text-dim">가격</span>
          <span className="pf-accent">{form.discovered ? fmtGold(form.price) : '???'}</span>
          <span className="text-text-dim">잡은 수</span>
          <span className="pf-accent">{form.discovered ? `${form.count}마리` : '???'}</span>
          <span className="text-text-dim">최대 크기</span>
          <span className="pf-accent">{form.discovered
            ? <>{fmtSize(form.maxSize)} <span className="text-text-dim text-xs">(상위 {form.sizePercentile}%)</span></>
            : '???'}</span>
          <span className="text-text-dim">처음 만난 날</span>
          <span>{form.discovered ? (form.firstCaught ?? '알 수 없음') : '???'}</span>
        </div>
        {!ranking.offline && (
          <div className="mt-3">
            <Subheading>크기 순위</Subheading>
            <RankingStatus loading={ranking.loading} failed={ranking.failed} offline={false}
                           empty={!!ranking.data && ranking.data.top.length === 0} />
            {ranking.data && ranking.data.top.length > 0 && (
              <RankList rows={ranking.data.top} me={ranking.data.me} valueLabel="크기"
                        format={fmtSize} />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
