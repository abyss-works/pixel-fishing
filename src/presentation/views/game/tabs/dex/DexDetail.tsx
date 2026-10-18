import { useState } from 'react';
import type { Fish, GameState } from '../../../../../game/rules/logic';
import { selectDexDetailData } from '../../../../../features/dex/model/catalog';
import { selectSizeDistribution } from '../../../../../features/dex/model/sizeDistribution';
import { useSpeciesRanking } from '../../../../../features/ranking/service/useRanking';
import RankList from '../../../../ui/RankList';
import RankingStatus from '../../../overlays/ranking/RankingStatus';
import ArrowButton from '../../../../ui/ArrowButton';
import Modal from '../../../../ui/Modal';
import Inset from '../../../../ui/Inset';
import KeyValueRow from '../../../../ui/KeyValueRow';
import SectionTitle from '../../../../ui/SectionTitle';
import FishSprite from '../../../../ui/fish/FishSprite';
import { RarityText } from '../../../../ui/fish/RarityTag';
import PageTitle from '../../../../ui/PageTitle';
import { fmtGold, fmtSize } from '../../../../ui/format';
import SizeDistributionChart from './SizeDistributionChart';

// 도감 상세보기 — 왼쪽은 표본(오목한 진열 칸의 초상화·이름·로어·기록), 오른쪽은 크기 분포와 크기 순위.
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
      <div className="grid grid-cols-2 gap-5 max-[640px]:grid-cols-1">
        <section className="min-w-0 flex flex-col gap-3">
          {/* 진열 칸 — 위에서 비치는 물빛(표면→바탕)을 깔고 가운데에 초상화. 폼 전환 화살표는 칸 안 양옆 */}
          <Inset className="relative flex items-center justify-between gap-2 px-2 py-4
                            bg-[linear-gradient(180deg,var(--c-surface-2),var(--c-bg)_78%)]">
            <ArrowButton dir={-1} tone="solid" aria-label="이전 형태"
                         onClick={() => setI((i - 1 + forms.length) % forms.length)} />
            <div className="flex flex-col items-center">
              <FishSprite fish={fish} preset="portrait" form={form.form} discovered={known} animate={known}
                          ariaLabel={known ? fish.name : '미확인 변종'} className="block" />
              <span className="pf-accent mt-1 text-2xs text-text-dim">
                {form.form === 'variant' ? '돌연변이' : '기본형'} · {i + 1}/{forms.length}
              </span>
            </div>
            <ArrowButton dir={1} tone="solid" aria-label="다음 형태"
                         onClick={() => setI((i + 1) % forms.length)} />
          </Inset>

          {/* 미발견 폼도 같은 구조로 렌더(값만 ??? 마스킹) — 폼 전환 시 레이아웃 점프 방지 */}
          <div className="flex items-baseline justify-between gap-2">
            <PageTitle>{known ? form.name : '???'}</PageTitle>
            <span className="text-sm"><RarityText rarity={fish.rarity} /></span>
          </div>
          <p className="text-sm leading-[1.8] text-text-dim">
            {known ? form.lore : '…아직 만나지 못한 개체다. 어딘가에서 헤엄치고 있을 것이다.'}
          </p>
          <Inset divided>
            <KeyValueRow label="가격" value={<span className="pf-accent">{known ? fmtGold(form.price) : '???'}</span>} />
            <KeyValueRow label="잡은 수" value={<span className="pf-accent">{known ? `${form.count}마리` : '???'}</span>} />
            <KeyValueRow label="최대 크기" value={known
              ? <><span className="pf-accent text-gold">{fmtSize(form.maxSize)}</span>
                  <span className="ml-1.5 text-xs text-text-dim">상위 {form.sizePercentile}%</span></>
              : '???'} />
            <KeyValueRow label="처음 만난 날" value={known ? (form.firstCaught ?? '알 수 없음') : '???'} />
          </Inset>
        </section>

        <section className="min-w-0 flex flex-col">
          <SectionTitle>크기 분포</SectionTitle>
          <Inset className="px-3 pt-3 pb-2">
            <SizeDistributionChart data={distribution} />
          </Inset>

          {!ranking.offline && (
            <>
              <SectionTitle>크기 순위</SectionTitle>
              <Inset className="flex flex-col">
                {ranking.data && ranking.data.top.length > 0 ? (
                  <>
                    {/* 표 머리와 순위 다섯 줄 높이 — 그 아래는 칸 안에서 스크롤한다 */}
                    <div className="pf-scroll-panel max-h-[178px] overflow-y-auto px-1">
                      <RankList rows={ranking.data.top} me={null} valueLabel="크기" format={fmtSize} />
                    </div>
                    {meOutside && (
                      <p className="border-t border-line px-2 py-1.5 text-sm text-accent">
                        내 순위 {meOutside.rank}위 · {fmtSize(meOutside.value)}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-24 items-center justify-center px-3">
                    <RankingStatus loading={ranking.loading} failed={ranking.failed} offline={false}
                                   empty={!!ranking.data && ranking.data.top.length === 0} />
                  </div>
                )}
              </Inset>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
