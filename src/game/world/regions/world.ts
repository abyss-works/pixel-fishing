// 지역: 대양(병합 바다) — 오픈월드화 Phase 3(구역 데이터). 태평양·동남아&오세아니아·인도양
// 세 바다가 **하나의 항해 지역**이 되고, 구 travel 트리거(루손 해협·말라카 해협)는 소멸한다.
// 지형과 앵커는 지역 설정에서 생성된 마스크 데이터로 결정한다.
// 이 파일은 게임 의미론만 기술한다: 문자 해석(legend), 시설 크기, 트리거, 텍스트.
// 어군은 고정 앵커가 아니라 날짜 시드로 절차 배치한다(schoolsOf) — 생성 데이터의 school_* 앵커는
// 더 이상 읽지 않는다.
//
// 구역 경계는 셀의 zone 문자로 인코딩된다(1=태평양 2=동남아 열린 바다 3=인도양 m=마다가스카르 a=남대서양 열린 바다 N=아직 열지 않은 바다). 경계 통과
// 게이트는 Field의 구역 전이 판정(zoneOf)이 맡고, 자격 기준은 구역 데이터 entryBoat다(Q5 —
// 클라 연출 + 서버 하한 검증은 spots.boatTier가 그대로 유지).
// 4/5/6/7/8 = 구역 라벨 전용 문자 — 물(통행 가능)이지만 spot이 없어 낚시 불가, 눈에 보이지 않는다.
import type { BaseId, MapCellDef, Point, RegionPack } from '../types';
import { placeHarbor } from '../harborPlacement';
import { isSeaFacing } from '../harborPlacement';
import type { HarborPlacement } from '../harborPlacement';
import { compileMap, mapBounds } from '../mask';
import { CELL_W, CELL_H, MASK_ROWS, ANCHORS, WINDOW, GRID_OFFSET, GLOBAL_COLS } from './generated/world.mask';

const A = ANCHORS;

// 마스크 문자 해석(legend) — **셀은 존만** 안다. 스팟은 셀 범위가 아니라
// 존 안에 배치되는 어군 오브젝트라 셀에 새기지 않는다). 캐스팅 판정은 학교(schools)가 담당.
// 월드와 지구 마스크는 같은 문자 체계를 쓴다 — 세계지도도 이 범례로 지구 마스크를 컴파일한다.
// 하위 존 문자(t/d/w/r/s/c)는 이제 하위 존의 범위다 — 셀 zone이 하위 존을 가리키고
// 스팟은 그 존에 배치된 어군이다. '4'/'5'/'6'/'7'/'8' = 최상위 존 라벨 전용 문자(물이지만 통행만).
export const WORLD_LEGEND: Record<string, MapCellDef> = {
  '1': { water: true, style: 'sea', zone: 'pacific' },
  '2': { water: true, style: 'sea', zone: 'seasia' },           // 열린 바다 통행 전용 — 최상위 스팟 없음
  '3': { water: true, style: 'sea', zone: 'indian' },
  m: { water: true, style: 'sea', zone: 'madagascar' },
  a: { water: true, style: 'sea', zone: 'southatlantic' },       // 열린 바다 통행 전용 — 최상위 스팟 없음
  t: { water: true, style: 'deep', zone: 'deep', label: '마리아나 해구' },
  d: { water: true, style: 'deep', zone: 'dragonhole', label: '드래곤 홀' },
  w: { water: true, style: 'wreck', zone: 'coron', label: '코론 침선 지대' },
  r: { water: true, style: 'coral', zone: 'barrierreef', label: '그레이트 배리어 리프' },
  s: { water: true, style: 'deep', zone: 'southindian', label: '남인도양' },
  c: { water: true, style: 'deep', zone: 'comorodeep', label: '코모로 심해' },
  b: { water: true, style: 'wreck', zone: 'benguela', label: '남대서양 용승대' },
  h: { water: true, style: 'coral', zone: 'sthelena', label: '세인트헬레나' },
  '4': { water: true, style: 'sea', zone: 'pacific', label: '태평양' },
  '5': { water: true, style: 'sea', zone: 'seasia', label: '동남아&오세아니아' },
  '6': { water: true, style: 'sea', zone: 'indian', label: '인도양' },
  '7': { water: true, style: 'sea', zone: 'madagascar', label: '마다가스카르' },
  '8': { water: true, style: 'sea', zone: 'southatlantic', label: '남대서양' },
  N: { water: true, style: 'sea', closed: true },  // 아직 열지 않은 바다(적도 북쪽 대서양·지중해) — 통행 불가
  L: { land: true },
  '.': { water: true, style: 'sea' }, // 구역 밖 잉여 물(내륙해 등) — 통행만, 낚시·구역 아님
};

export const WORLD_MAP = compileMap(CELL_W, CELL_H, WORLD_LEGEND, MASK_ROWS,
  { colOffset: GRID_OFFSET.col, rowOffset: GRID_OFFSET.row, globalCols: GLOBAL_COLS });
/** 항해 창이 차지하는 게임 좌표 영역 — 이 밖은 이동할 수 없다 */
export const WORLD_BOUNDS = mapBounds(WORLD_MAP);

// 항구 5곳 — 기준점(경위도 앵커)과 바다 방향만 설정에 있고 나머지는 placeHarbor가 계산한다.
function harborAt(name: string): HarborPlacement {
  const a = A[name];
  if (!a || !isSeaFacing(a.facing)) throw Error(`항구 앵커 ${name}: 위치 또는 바다 방향이 없다`);
  return placeHarbor(a, a.facing);
}
/** 거점 id별 항구 배치 — 거점 id는 앵커 이름과 같다 */
export const HARBORS = {
  harbor: harborAt('harbor'),       // 부산항(한반도 남동 해안)
  manila: harborAt('manila'),       // 마닐라항(루손 서해안)
  colombo: harborAt('colombo'),     // 콜롬보항(스리랑카 서해안)
  toamasina: harborAt('toamasina'), // 투아마시나항(마다가스카르 동해안)
  walvisbay: harborAt('walvisbay'), // 월비스베이항(나미비아 서해안)
} satisfies Partial<Record<BaseId, HarborPlacement>>;
type HarborId = keyof typeof HARBORS;
const HARBOR_NAMES: Record<HarborId, string> = {
  harbor: '부산항', manila: '마닐라항', colombo: '콜롬보항', toamasina: '투아마시나항', walvisbay: '월비스베이항',
};
const HARBOR_IDS = Object.keys(HARBORS) as HarborId[];
/** 고향 항구의 출항 자리가 새 게임과 되돌림의 기본 위치다 */
export const WORLD_SPAWN: Point = HARBORS.harbor.departure;

export const WORLD: RegionPack = {
  id: 'world',
  name: '대양',
  base: 'harbor',
  info: {
    shortName: '대양',
    tagline: '세계의 바다가 하나로 이어진다',
    lore: '한 배로 건너는 세계의 바다. 물빛도, 그 아래 사는 것도 지나는 물마다 다르다.',
    tips: [],
    controls: [],
  },
  bounds: WORLD_BOUNDS,
  geoWindow: WINDOW,
  movement: 'sail',
  map: WORLD_MAP,
  // 접안 부두 — 시각용 통행판(sail이라 충돌엔 무영향)
  decks: Object.values(HARBORS).map(h => ({ rect: h.dock, style: 'pier' as const })),
  waveCount: 480, // 열린 바다 지도 전체 순환 — 면적 비례(2배 확대 대응. 뷰포트 밖은 캔버스가 클리핑)
  buildings: Object.values(HARBORS).map(h => ({ rect: h.building, sprite: 'harbor' as const, flip: h.flip })),
  decorations: [],
  spawn: WORLD_SPAWN,
  // travel 트리거 없음 — 구역 경계 게이트(Field zoneOf 전이 판정)가 대체한다.
  // 접안 트리거만 항구마다 하나 — trig.base로 거점을 지정한다(팩 base는 고향 항구가 기본값).
  triggers: HARBOR_IDS.map(base => ({
    rect: HARBORS[base].berth, action: 'base' as const, base,
    msg: `${HARBOR_NAMES[base]}에 접안했어요. 시설을 눌러 정비해 보세요.`,
  })),
  labels: HARBOR_IDS.map(base => ({
    text: HARBOR_NAMES[base], x: HARBORS[base].building.x + HARBORS[base].building.w / 2,
    y: HARBORS[base].building.y + 2, color: 'gold' as const, size: 8,
  })),
};
