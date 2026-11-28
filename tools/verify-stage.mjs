import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_STAGE_URL = 'https://pixel-fishing-preview.abyssworks.dev';
const REQUIRED_DEPLOYMENTS = ['pixel-fishing', 'pixel-fishing-realtime', 'pixel-fishing-admin'];
const DEV_TAG_RE = /^dev-[0-9a-f]{7,}$/;

/** Validates ArgoCD Application sync and health state. */
export function validateArgocdStatus(appJson) {
  const errors = [];
  const syncStatus = appJson?.status?.sync?.status;
  const healthStatus = appJson?.status?.health?.status;

  if (syncStatus !== 'Synced') {
    errors.push(`ArgoCD sync status is ${syncStatus ?? 'missing'} (expected Synced)`);
  }
  if (healthStatus !== 'Healthy') {
    errors.push(`ArgoCD health status is ${healthStatus ?? 'missing'} (expected Healthy)`);
  }

  return { ok: errors.length === 0, errors };
}

function extractImageTag(image) {
  if (typeof image !== 'string') return null;
  const lastSlash = image.lastIndexOf('/');
  const lastColon = image.lastIndexOf(':');
  if (lastColon <= lastSlash) return null;
  return image.slice(lastColon + 1);
}

/** Validates that required staging deployments are ready and share an identical dev-<sha> tag. */
export function validateDeploymentParity(deployListJson) {
  const errors = [];
  const items = Array.isArray(deployListJson?.items) ? deployListJson.items : [];
  const byName = new Map();
  for (const item of items) {
    const name = item?.metadata?.name;
    if (typeof name === 'string') byName.set(name, item);
  }

  const observedTags = new Set();

  for (const name of REQUIRED_DEPLOYMENTS) {
    const deploy = byName.get(name);
    if (!deploy) {
      errors.push(`Deployment ${name} is missing`);
      continue;
    }

    const replicas = deploy?.spec?.replicas;
    const readyReplicas = deploy?.status?.readyReplicas ?? 0;
    if (typeof replicas !== 'number' || replicas <= 0 || readyReplicas !== replicas) {
      errors.push(
        `Deployment ${name} readyReplicas=${readyReplicas} does not match replicas=${String(replicas)}`,
      );
    }

    const image = deploy?.spec?.template?.spec?.containers?.[0]?.image;
    const tag = extractImageTag(image);
    if (!tag || !DEV_TAG_RE.test(tag)) {
      errors.push(`Deployment ${name} has invalid dev image tag: ${String(image)}`);
    } else {
      observedTags.add(tag);
    }
  }

  if (observedTags.size > 1) {
    errors.push(`Deployment image tag mismatch: ${Array.from(observedTags).join(', ')}`);
  }

  const tag = observedTags.size === 1 ? Array.from(observedTags)[0] : null;
  return { ok: errors.length === 0, tag, errors };
}

/** Validates HTTP and WebSocket smoke responses from the staging gateway. */
export function validateSmokeResponses(results) {
  const errors = [];

  const homeStatus = results?.home?.status;
  if (homeStatus !== 200 && homeStatus !== 401) {
    errors.push(`GET / returned ${String(homeStatus)} (expected 200 or 401)`);
  }
  const csp = results?.home?.csp;
  if (typeof csp !== 'string' || csp.trim().length === 0) {
    errors.push('GET / is missing content-security-policy header');
  }

  const actionStatus = results?.action?.status;
  if (actionStatus !== 204 && actionStatus !== 405) {
    errors.push(`GET /api/action returned ${String(actionStatus)} (expected 204 or 405)`);
  }

  const liveStatus = results?.liveWs?.status;
  if (liveStatus !== 401) {
    errors.push(`WS /api/live returned ${String(liveStatus)} (expected 401)`);
  }

  return { ok: errors.length === 0, errors };
}

function probeWebSocketUpgrade(targetUrl) {
  const url = new URL('/api/live', targetUrl);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolvePromise, rejectPromise) => {
    const req = client.request(
      url,
      {
        method: 'GET',
        timeout: 10_000,
        headers: {
          Origin: url.origin,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        },
      },
      (res) => {
        res.resume();
        resolvePromise({ status: res.statusCode ?? 0 });
      },
    );

    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolvePromise({ status: res.statusCode ?? 101 });
    });

    req.on('timeout', () => {
      req.destroy(new Error('WS /api/live probe timed out'));
    });

    req.on('error', rejectPromise);
    req.end();
  });
}

async function runSmokeChecks(baseUrl) {
  const homeRes = await fetch(new URL('/', baseUrl), {
    headers: { Accept: 'text/html' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const actionRes = await fetch(new URL('/api/action', baseUrl), {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const liveWs = await probeWebSocketUpgrade(baseUrl);

  return {
    home: {
      status: homeRes.status,
      csp: homeRes.headers.get('content-security-policy'),
    },
    action: {
      status: actionRes.status,
    },
    liveWs,
  };
}

function runK8sChecks() {
  const appRaw = execFileSync('kubectl', ['-n', 'argocd', 'get', 'app', 'pixel-fishing-stage', '-o', 'json'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  const argocdResult = validateArgocdStatus(JSON.parse(appRaw));

  const deployRaw = execFileSync('kubectl', ['-n', 'pixel-fishing-stage', 'get', 'deploy', '-o', 'json'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  const deployResult = validateDeploymentParity(JSON.parse(deployRaw));

  return { argocdResult, deployResult };
}

function parseArgs(argv) {
  let url = DEFAULT_STAGE_URL;
  let checkK8s = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check-k8s') {
      checkK8s = true;
    } else if (arg === '--url' && i + 1 < argv.length) {
      url = argv[++i];
    } else if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length);
    }
  }

  return { url, checkK8s };
}

async function main() {
  const { url, checkK8s } = parseArgs(process.argv.slice(2));
  const failures = [];

  if (checkK8s) {
    const { argocdResult, deployResult } = runK8sChecks();
    if (!argocdResult.ok) failures.push(...argocdResult.errors);
    if (!deployResult.ok) failures.push(...deployResult.errors);
    if (argocdResult.ok && deployResult.ok) {
      console.log(`K8s OK: ArgoCD Synced/Healthy, deployments ready (${deployResult.tag})`);
    }
  }

  const smokeRaw = await runSmokeChecks(url);
  const smokeResult = validateSmokeResponses(smokeRaw);
  if (!smokeResult.ok) {
    failures.push(...smokeResult.errors);
  } else {
    console.log(
      `Smoke OK (${url}): GET / -> ${smokeRaw.home.status}, GET /api/action -> ${smokeRaw.action.status}, WS /api/live -> ${smokeRaw.liveWs.status}`,
    );
  }

  if (failures.length > 0) {
    for (const msg of failures) console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
