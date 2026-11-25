// 신뢰 프록시 대역 판별 — 인증 IP 추출과 HTTPS 프록시 헤더 판정이 같은 사설·클러스터 CIDR 목록을 공유한다.
import { BlockList, isIP } from 'node:net';

export const TRUSTED_PROXY_CIDRS = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
  '169.254.0.0/16',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
] as const;

const trustedProxies = new BlockList();
for (const cidr of TRUSTED_PROXY_CIDRS) {
  const [network, prefixText] = cidr.split('/');
  const family = isIP(network) === 6 ? 'ipv6' : 'ipv4';
  trustedProxies.addSubnet(network, Number(prefixText), family);
}

/** 소켓 원격 주소가 신뢰 프록시(루프백·사설·클러스터 대역)에 속하는지 판별한다 */
export function isTrustedProxyAddress(address: string | undefined): boolean {
  if (!address) return false;
  const withoutZone = address.split('%')[0]?.trim() ?? '';
  if (!withoutZone) return false;
  const mapped = withoutZone.toLowerCase().startsWith('::ffff:') ? withoutZone.slice(7) : null;
  const normalized = mapped && isIP(mapped) === 4 ? mapped : withoutZone;
  const version = isIP(normalized);
  if (version === 4) return trustedProxies.check(normalized, 'ipv4');
  if (version === 6) return trustedProxies.check(normalized, 'ipv6');
  return false;
}
