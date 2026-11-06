// 한국어 조사 고르기 — 순수 함수. 화면 문장에서 이름 뒤에 붙는 조사를 받침에 맞춘다.

/** 한글 음절의 받침 번호 중 ㄹ */
const RIEUL_FINAL = 8;

/**
 * 단어의 마지막 글자에 받침이 있으면 앞 조사, 없으면 뒤 조사를 고른다.
 * 한글 음절(가~힣)만 받침을 판정하고, 그 밖의 글자로 끝나면 받침이 없는 쪽을 고른다.
 * '으로/로'는 받침 ㄹ도 받침이 없는 것으로 본다.
 * @param pair '이/가', '을/를', '은/는', '과/와'처럼 받침이 있을 때와 없을 때의 조사
 */
export function josa(word: string, pair: string): string {
  const [withFinal, withoutFinal] = pair.split('/');
  const code = word.charCodeAt(word.length - 1);
  const final = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
  const hasFinal = final !== 0 && !(pair === '으로/로' && final === RIEUL_FINAL);
  return hasFinal ? withFinal : withoutFinal;
}
