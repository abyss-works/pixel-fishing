import { useState } from 'react';
import type { Fish, GameState } from '../../../../../game/rules/logic';
import { selectDexDetailData } from '../../../../../features/dex/model/catalog';
import { selectSizeDistribution } from '../../../../../features/dex/model/sizeDistribution';
import { useSpeciesRanking } from '../../../../../features/ranking/service/useRanking';
import RankList from '../../../../ui/RankList';
import RankingStatus from '../../../overlays/ranking/RankingStatus';
import ArrowButton from '../../../../ui/ArrowButton';
import Modal from '../../../../ui/Modal';
import TitledCell from '../../../../ui/TitledCell';
import Inset from '../../../../ui/Inset';
import KeyValueRow from '../../../../ui/KeyValueRow';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RarityText } from '../../../../ui/fish/RarityTag';
import PageTitle from '../../../../ui/PageTitle';
import { fmtGold, fmtSize } from '../../../../ui/format';
import SizeDistributionChart from './SizeDistributionChart';

// 도감 상세보기 — 이름 머리 아래 2×2 메인 그리드: 위 줄 표본(초상화·로어) | 크기 분포, 아래 줄 기록 | 크기 순위.
// 칸은 패널을 겹치지 않고 표면을 파낸 오목한 칸(Inset)으로 나눠 다른 창의 노치·베벨 언어와 맞춘다.
// 변이는 "종만 같고 다른 개체"라 폼을 바꾸면 이름·로어·가격·마릿수·크기·첫 조우일이 그 폼의 것으로 바뀐다.
// 분포와 순위는 어종 단위라 폼과 무관하다. 좁은 화면에서는 위아래로 쌓는다.
export default function DexDetail({ fish, game, initialForm = 0, onClose }: {
  fish: Fish; game: GameState; initialForm?: number; onClose: () => void;
}) {
  // forms[0] = 기본형 · forms[1+] = 변이(발견해야 정보 공개). 크기 폴백 = 분포 평균 — 기록 없는 이관 개체 대응.
  const forms = selectDexDetailData(game, fish);
  const [i, setI] = useState(initialForm);
  const form = forms[i];
  const ranking = useSpeciesRanking(fish.id);
  const distribution = selectSizeDistribution(game, fish);
  const known = form.discovered;
  const meOutside = ranking.data?.me && !ranking.data.top.some(r => r.me) ? ranking.data.me : null;

  return (
    <Modal xl onClose={onClose}>
      {/* 미발견 폼도 같은 구조로 렌더(값만 ??? 마스킹) — 폼 전환 시 레이아웃 점프 방지 */}
      <header className="mb-3 flex items-baseline gap-3 border-b border-line pb-2 pr-8">
        <PageTitle>{known ? form.name : '???'}</PageTitle>
        <span className="text-sm"><RarityText rarity={fish.rarity} /></span>
        <span className="pf-accent ml-auto text-2xs text-text-dim">
          {form.form === 'variant' ? '돌연변이' : '기본형'} {i + 1}/{forms.length}
        </span>
      </header>

      {/* 메인 그리드 2×2 — 위 줄(표본 | 크기 분포), 아래 줄(기록 | 크기 순위). 같은 줄의 칸은 높이를 맞춘다 */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 max-[640px]:grid-cols-1">
        <TitledCell title="표본">
          <Inset tone="light" className="flex flex-1 flex-col
                 bg-[linear-gradient(180deg,var(--c-surface-2),color-mix(in_oklab,var(--c-bg)_40%,var(--c-surface))_85%)]">
            <div className="flex items-center justify-between gap-2 px-2 pt-3">
              <ArrowButton dir={-1} tone="solid" aria-label="이전 형태"
                           onClick={() => setI((i - 1 + forms.length) % forms.length)} />
              <FishSprite fish={fish} preset="portrait" form={form.form} discovered={known} animate={known}
                          ariaLabel={known ? fish.name : '미확인 변종'} className="block" />
              <ArrowButton dir={1} tone="solid" aria-label="다음 형태"
                           onClick={() => setI((i + 1) % forms.length)} />
            </div>
            <p className="mt-auto px-3 pb-3 pt-2 text-sm leading-[1.8] text-text-dim">
              {known ? form.lore : '…아직 만나지 못한 개체다. 어딘가에서 헤엄치고 있을 것이다.'}
            </p>
          </Inset>
        </TitledCell>

        <TitledCell title="크기 분포">
          <Inset className="flex flex-1 flex-col justify-center px-3 pt-3 pb-2">
            <SizeDistributionChart data={distribution} />
          </Inset>
        </TitledCell>

        <TitledCell title="기록">
          <Inset divided className="flex-1">
            <KeyValueRow label="가격" value={<span className="pf-accent">{known ? fmtGold(form.price) : '???'}</span>} />
            <KeyValueRow label="잡은 수" value={<span className="pf-accent">{known ? `${form.count}마리` : '???'}</span>} />
            <KeyValueRow label="이 형태 최대" value={known
              ? <><span className="pf-accent text-gold">{fmtSize(form.maxSize)}</span>
                  <span className="ml-1.5 text-xs text-text-dim">상위 {form.sizePercentile}%</span></>
              : '???'} />
            <KeyValueRow label="처음 만난 날" value={known ? (form.firstCaught ?? '알 수 없음') : '???'} />
          </Inset>
        </TitledCell>

        {!ranking.offline && (
          <TitledCell title="크기 순위">
            <Inset className="flex flex-1 flex-col">
              {ranking.data && ranking.data.top.length > 0 ? (
                <>
                  {/* 표 머리와 순위 다섯 줄 높이 — 그 아래는 칸 안에서 스크롤한다 */}
                  <div className="pf-scroll-panel max-h-[178px] overflow-y-auto px-1">
                    <RankList rows={ranking.data.top} me={null} valueLabel="크기" format={fmtSize} />
                  </div>
                  {meOutside && (
                    <p className="mt-auto border-t border-line px-2 py-1.5 text-sm text-accent">
                      내 순위 {meOutside.rank}위 · {fmtSize(meOutside.value)}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-1 min-h-24 items-center justify-center px-3">
                  <RankingStatus loading={ranking.loading} failed={ranking.failed} offline={false}
                                 empty={!!ranking.data && ranking.data.top.length === 0} />
                </div>
              )}
            </Inset>
          </TitledCell>
        )}
      </div>
    </Modal>
  );
}

