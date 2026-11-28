// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  classifyErrorPathStatus,
  extractBuildIdFromBundle,
  extractModuleScriptPath,
  validateArgocdStatus,
  validateAuthenticatedLiveHandshake,
  validateDeploymentParity,
  validateSmokeResponses,
} from './verify-stage.mjs';

function makeDeploy(name: string, replicas: number, readyReplicas: number, image: string) {
  return {
    metadata: { name },
    spec: {
      replicas,
      template: {
        spec: {
          containers: [{ name, image }],
        },
      },
    },
    status: { readyReplicas },
  };
}

describe('validateArgocdStatus', () => {
  it('passes when Synced and Healthy', () => {
    const result = validateArgocdStatus({
      status: { sync: { status: 'Synced' }, health: { status: 'Healthy' } },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when OutOfSync or Degraded', () => {
    const outOfSync = validateArgocdStatus({
      status: { sync: { status: 'OutOfSync' }, health: { status: 'Healthy' } },
    });
    expect(outOfSync.ok).toBe(false);
    expect(outOfSync.errors.length).toBeGreaterThan(0);

    const degraded = validateArgocdStatus({
      status: { sync: { status: 'Synced' }, health: { status: 'Degraded' } },
    });
    expect(degraded.ok).toBe(false);
    expect(degraded.errors.length).toBeGreaterThan(0);
  });

  it('fails when status fields are missing', () => {
    const missing = validateArgocdStatus({});
    expect(missing.ok).toBe(false);
    expect(missing.errors.length).toBeGreaterThan(0);
  });
});

describe('validateDeploymentParity', () => {
  it('passes when all three deployments are ready with identical dev-<sha> tag', () => {
    const result = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 1, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-realtime', 2, 2, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:dev-2416417'),
        makeDeploy('pixel-fishing-valkey', 1, 1, 'valkey/valkey:8-alpine'),
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.tag).toBe('dev-2416417');
    expect(result.errors).toEqual([]);
  });

  it('fails when image tags mismatch across deployments', () => {
    const result = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 1, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-realtime', 2, 2, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:dev-abcdef1'),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes('mismatch'))).toBe(true);
  });

  it('fails when readyReplicas does not match replicas or deployment is missing', () => {
    const unready = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 0, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-realtime', 2, 2, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:dev-2416417'),
      ],
    });
    expect(unready.ok).toBe(false);
    expect(unready.errors.some((e: string) => e.includes('readyReplicas'))).toBe(true);

    const missing = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 1, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:dev-2416417'),
      ],
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors.some((e: string) => e.includes('pixel-fishing-realtime'))).toBe(true);
  });

  it('fails when image tag is not dev-<sha>', () => {
    const result = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 1, 'ghcr.io/abyss-works/pixel-fishing:v0.21.0'),
        makeDeploy('pixel-fishing-realtime', 2, 2, 'ghcr.io/abyss-works/pixel-fishing:v0.21.0'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:v0.21.0'),
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe('validateSmokeResponses', () => {
  it('passes for valid staging smoke responses', () => {
    expect(
      validateSmokeResponses({
        home: { status: 401, csp: "default-src 'self'" },
        action: { status: 204 },
        liveWs: { status: 401 },
      }),
    ).toEqual({ ok: true, errors: [] });

    expect(
      validateSmokeResponses({
        home: { status: 200, csp: "default-src 'self'" },
        action: { status: 405 },
        liveWs: { status: 401 },
      }),
    ).toEqual({ ok: true, errors: [] });
  });

  it('fails on 503/502/404 or missing CSP header', () => {
    const badHome = validateSmokeResponses({
      home: { status: 503, csp: null },
      action: { status: 204 },
      liveWs: { status: 401 },
    });
    expect(badHome.ok).toBe(false);
    expect(badHome.errors.length).toBeGreaterThanOrEqual(2);

    const badAction = validateSmokeResponses({
      home: { status: 401, csp: "default-src 'self'" },
      action: { status: 503 },
      liveWs: { status: 401 },
    });
    expect(badAction.ok).toBe(false);

    const badWs = validateSmokeResponses({
      home: { status: 401, csp: "default-src 'self'" },
      action: { status: 405 },
      liveWs: { status: 502 },
    });
    expect(badWs.ok).toBe(false);
  });

  it('validates optional notFound and staleAction error paths when present', () => {
    expect(
      validateSmokeResponses({
        home: { status: 401, csp: "default-src 'self'" },
        action: { status: 204 },
        liveWs: { status: 401 },
        notFound: { status: 404 },
        staleAction: { status: 426 },
      }),
    ).toEqual({ ok: true, errors: [] });

    expect(
      validateSmokeResponses({
        home: { status: 401, csp: "default-src 'self'" },
        action: { status: 204 },
        liveWs: { status: 401 },
        notFound: { status: 401 },
        staleAction: { status: 401 },
      }),
    ).toEqual({ ok: true, errors: [] });

    const badErrorPaths = validateSmokeResponses({
      home: { status: 401, csp: "default-src 'self'" },
      action: { status: 204 },
      liveWs: { status: 401 },
      notFound: { status: 500 },
      staleAction: { status: 502 },
    });
    expect(badErrorPaths.ok).toBe(false);
    expect(badErrorPaths.errors.length).toBe(2);
  });
});

describe('classifyErrorPathStatus', () => {
  it('accepts 404 or 401 for notFound and rejects 5xx or unexpected codes', () => {
    expect(classifyErrorPathStatus('notFound', 404).ok).toBe(true);
    expect(classifyErrorPathStatus('notFound', 401).ok).toBe(true);
    expect(classifyErrorPathStatus('notFound', 500).ok).toBe(false);
    expect(classifyErrorPathStatus('notFound', 503).ok).toBe(false);
    expect(classifyErrorPathStatus('notFound', 200).ok).toBe(false);
  });

  it('accepts 426 or 401 for staleAction and rejects 5xx or unexpected codes', () => {
    expect(classifyErrorPathStatus('staleAction', 426).ok).toBe(true);
    expect(classifyErrorPathStatus('staleAction', 401).ok).toBe(true);
    expect(classifyErrorPathStatus('staleAction', 502).ok).toBe(false);
    expect(classifyErrorPathStatus('staleAction', 500).ok).toBe(false);
    expect(classifyErrorPathStatus('staleAction', 200).ok).toBe(false);
  });
});

describe('bundle build extraction helpers', () => {
  it('extracts module script path from HTML', () => {
    const html = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-abc123.js"></script></head></html>';
    expect(extractModuleScriptPath(html)).toBe('/assets/index-abc123.js');
    expect(extractModuleScriptPath('<html></html>')).toBeNull();
  });

  it('extracts build id from bundled JS', () => {
    expect(extractBuildIdFromBundle('const h={"x-build-id":"abcdef1234567890"};')).toBe('abcdef1234567890');
    expect(extractBuildIdFromBundle("const h={'x-build-id': 'dev'};")).toBe('dev');
    expect(extractBuildIdFromBundle('console.log(1)')).toBeNull();
  });
});

describe('validateAuthenticatedLiveHandshake', () => {
  it('passes when home is 200, matching build opens without 4001, and mismatch closes with 4001', () => {
    const result = validateAuthenticatedLiveHandshake({
      homeStatus: 200,
      buildId: 'abcdef1234567890',
      version: '0.21.0',
      matched: { opened: true, closeCode: 1000, error: null },
      mismatched: { opened: true, closeCode: 4001, error: null },
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('fails when home is not 200 or build/version is missing', () => {
    const result = validateAuthenticatedLiveHandshake({
      homeStatus: 401,
      buildId: null,
      version: null,
      matched: { opened: true, closeCode: 1000, error: null },
      mismatched: { opened: false, closeCode: 4001, error: null },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBe(3);
  });

  it('fails when matched connection closes with 4001 or fails to open', () => {
    const closed4001 = validateAuthenticatedLiveHandshake({
      homeStatus: 200,
      buildId: 'abcdef1',
      version: '0.21.0',
      matched: { opened: true, closeCode: 4001, error: null },
      mismatched: { opened: false, closeCode: 4001, error: null },
    });
    expect(closed4001.ok).toBe(false);

    const notOpened = validateAuthenticatedLiveHandshake({
      homeStatus: 200,
      buildId: 'abcdef1',
      version: '0.21.0',
      matched: { opened: false, closeCode: 1006, error: 'unexpected server response: 401' },
      mismatched: { opened: false, closeCode: 4001, error: null },
    });
    expect(notOpened.ok).toBe(false);
  });

  it('fails when mismatched connection does not close with 4001', () => {
    const result = validateAuthenticatedLiveHandshake({
      homeStatus: 200,
      buildId: 'abcdef1',
      version: '0.21.0',
      matched: { opened: true, closeCode: 1000, error: null },
      mismatched: { opened: true, closeCode: 1000, error: null },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes('4001'))).toBe(true);
  });
});
