// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

function readManifest(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

/** Extracts ordered env var names from the primary container in a Deployment manifest. */
function extractContainerEnvNames(yaml: string, containerName: string): string[] {
  const lines = yaml.split(/\r?\n/);
  let inContainers = false;
  let inTargetContainer = false;
  let inEnv = false;
  let envIndent = -1;
  const names: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^---\s*$/.test(trimmed)) {
      inContainers = false;
      inTargetContainer = false;
      inEnv = false;
      continue;
    }

    const indent = line.length - line.trimStart().length;

    if (trimmed === 'containers:') {
      inContainers = true;
      inTargetContainer = false;
      inEnv = false;
      continue;
    }
    if (trimmed === 'initContainers:') {
      inContainers = false;
      inTargetContainer = false;
      inEnv = false;
      continue;
    }

    if (!inContainers) continue;

    if (trimmed.startsWith('- name:')) {
      const value = trimmed.slice('- name:'.length).trim();
      if (!inEnv) {
        inTargetContainer = value === containerName;
        continue;
      }
      if (indent <= envIndent + 2) {
        names.push(value);
        continue;
      }
    }

    if (!inTargetContainer) continue;

    if (trimmed === 'env:') {
      inEnv = true;
      envIndent = indent;
      continue;
    }

    if (inEnv && indent <= envIndent) {
      inEnv = false;
    }
  }

  return names;
}

interface KustomizePatch {
  kind: string;
  name: string;
  patch: string;
}

/** Extracts target/patch pairs from a kustomization manifest. */
function extractKustomizePatches(yaml: string): KustomizePatch[] {
  const lines = yaml.split(/\r?\n/);
  const patches: KustomizePatch[] = [];
  let inPatches = false;
  let current: KustomizePatch | null = null;
  let inPatchBody = false;
  let patchBodyIndent = -1;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      current.patch = bodyLines.join('\n');
      patches.push(current);
      current = null;
      bodyLines = [];
      inPatchBody = false;
      patchBodyIndent = -1;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (inPatchBody) {
      if (patchBodyIndent === -1) {
        if (trimmed === '') {
          bodyLines.push('');
          continue;
        }
        if (indent > 0) {
          patchBodyIndent = indent;
          bodyLines.push(line.slice(patchBodyIndent));
          continue;
        }
        inPatchBody = false;
      } else if (trimmed === '' || indent >= patchBodyIndent) {
        bodyLines.push(line.slice(patchBodyIndent));
        continue;
      } else {
        inPatchBody = false;
      }
    }

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (indent === 0 && trimmed === 'patches:') {
      inPatches = true;
      continue;
    }
    if (indent === 0 && trimmed !== 'patches:') {
      flush();
      inPatches = false;
      continue;
    }
    if (!inPatches) continue;

    if (trimmed.startsWith('- target:')) {
      flush();
      current = { kind: '', name: '', patch: '' };
      continue;
    }
    if (!current) continue;

    if (trimmed.startsWith('kind:')) {
      current.kind = trimmed.slice('kind:'.length).trim();
    } else if (trimmed.startsWith('name:')) {
      current.name = trimmed.slice('name:'.length).trim();
    } else if (trimmed === 'patch: |-' || trimmed === 'patch: |') {
      inPatchBody = true;
      patchBodyIndent = -1;
      bodyLines = [];
    }
  }

  flush();
  return patches;
}

/** Extracts image newTag mappings from a kustomization manifest. */
function extractImageTags(yaml: string): Map<string, string> {
  const lines = yaml.split(/\r?\n/);
  const tags = new Map<string, string>();
  let inImages = false;
  let currentImage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;

    if (indent === 0 && trimmed === 'images:') {
      inImages = true;
      continue;
    }
    if (indent === 0 && trimmed !== 'images:') {
      inImages = false;
      continue;
    }
    if (!inImages) continue;

    if (trimmed.startsWith('- name:')) {
      currentImage = trimmed.slice('- name:'.length).trim();
    } else if (trimmed.startsWith('newTag:') && currentImage) {
      tags.set(currentImage, trimmed.slice('newTag:'.length).trim());
    }
  }

  return tags;
}

/** Extracts a literal (`|` or `|-`) ConfigMap data block with arbitrary indentation removed. */
function extractConfigMapLiteralBlock(yaml: string, configMapName: string, key: string): string {
  const docs = yaml.split(/^---\s*$/m);
  const targetDoc = docs.find(
    doc => /\bkind:\s*ConfigMap\b/.test(doc) && new RegExp(`\\bname:\\s*${configMapName}\\b`).test(doc),
  );
  if (!targetDoc) throw new Error(`ConfigMap not found: ${configMapName}`);

  const lines = targetDoc.split(/\r?\n/);
  const keyPattern = new RegExp(`^(\\s*)${key.replace('.', '\\.')}:\\s*\\|-?\\s*$`);
  let keyLineIdx = -1;
  let keyIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(keyPattern);
    if (match) {
      keyLineIdx = i;
      keyIndent = match[1].length;
      break;
    }
  }
  if (keyLineIdx === -1) throw new Error(`ConfigMap key not found: ${key}`);

  let blockIndent = -1;
  const blockLines: string[] = [];
  for (let i = keyLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (trimmed === '') {
      blockLines.push('');
      continue;
    }
    if (blockIndent === -1) {
      if (indent <= keyIndent) break;
      blockIndent = indent;
    } else if (indent < blockIndent) {
      break;
    }
    blockLines.push(line.slice(blockIndent));
  }

  while (blockLines.length > 0 && blockLines[blockLines.length - 1] === '') {
    blockLines.pop();
  }
  return blockLines.join('\n');
}

describe('k8s manifests invariants', () => {
  it('places BETTER_AUTH_URL, DEPLOY_ENV, CONSENT_EFFECTIVE_DATE at indices 1, 2, 3 in prod deployment and realtime manifests', () => {
    const deployEnv = extractContainerEnvNames(readManifest('k8s/prod/deployment.yaml'), 'pixel-fishing');
    const realtimeEnv = extractContainerEnvNames(readManifest('k8s/prod/realtime.yaml'), 'pixel-fishing-realtime');
    const adminEnv = extractContainerEnvNames(readManifest('k8s/prod/admin.yaml'), 'pixel-fishing-admin');

    for (const env of [deployEnv, realtimeEnv]) {
      expect(env[1]).toBe('BETTER_AUTH_URL');
      expect(env[2]).toBe('DEPLOY_ENV');
      expect(env[3]).toBe('CONSENT_EFFECTIVE_DATE');
    }
    expect(adminEnv[1]).toBe('BETTER_AUTH_URL');
    expect(adminEnv[2]).toBe('DEPLOY_ENV');

    const stagePatches = extractKustomizePatches(readManifest('k8s/stage/kustomization.yaml'));
    for (const targetName of ['pixel-fishing', 'pixel-fishing-realtime', 'pixel-fishing-admin']) {
      const envPatch = stagePatches.find(
        (p) => p.kind === 'Deployment' && p.name === targetName && p.patch.includes('/env/1/value'),
      );
      expect(envPatch).toBeDefined();
      expect(envPatch?.patch).toContain('/spec/template/spec/containers/0/env/1/value');
      expect(envPatch?.patch).toContain('/spec/template/spec/containers/0/env/2/value');
      if (targetName !== 'pixel-fishing-admin') {
        expect(envPatch?.patch).toContain('/spec/template/spec/containers/0/env/3/value');
      }
    }
  });

  it('overrides Deployment/pixel-fishing strategy to Recreate and clears rollingUpdate in stage kustomization', () => {
    const stagePatches = extractKustomizePatches(readManifest('k8s/stage/kustomization.yaml'));
    const strategyPatch = stagePatches.find(
      (p) => p.kind === 'Deployment' && p.name === 'pixel-fishing' && p.patch.includes('Recreate'),
    );

    expect(strategyPatch).toBeDefined();
    const patchBody = strategyPatch?.patch ?? '';
    const hasStrategicMergeClear =
      /type:\s*Recreate/.test(patchBody) && /rollingUpdate:\s*null/.test(patchBody);
    const hasJsonReplaceStrategy =
      /op:\s*replace/.test(patchBody) &&
      /path:\s*\/spec\/strategy/.test(patchBody) &&
      /type:\s*Recreate/.test(patchBody) &&
      !/rollingUpdate:\s*\{/.test(patchBody);

    expect(hasStrategicMergeClear || hasJsonReplaceStrategy).toBe(true);
  });

  it('specifies valid dev-<sha> newTag values for pixel-fishing and pixel-fishing-admin in stage kustomization', () => {
    const tags = extractImageTags(readManifest('k8s/stage/kustomization.yaml'));
    const appTag = tags.get('ghcr.io/abyss-works/pixel-fishing');
    const adminTag = tags.get('ghcr.io/abyss-works/pixel-fishing-admin');

    expect(appTag).toMatch(/^dev-[0-9a-f]{7,}$/);
    expect(adminTag).toMatch(/^dev-[0-9a-f]{7,}$/);
  });

  it('matches 503.html inline script SHA-256 digest with default.conf CSP script-src hash', () => {
    const errorsYaml = readManifest('k8s/prod/errors.yaml');
    const html503 = extractConfigMapLiteralBlock(errorsYaml, 'pixel-fishing-errors-html', '503.html');
    const defaultConf = extractConfigMapLiteralBlock(errorsYaml, 'pixel-fishing-errors-html', 'default.conf');

    const scriptMatch = html503.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    const digest = createHash('sha256').update(scriptMatch![1], 'utf8').digest('base64');
    const expectedToken = `'sha256-${digest}'`;

    const cspMatch = defaultConf.match(/Content-Security-Policy\s+"([^"]+)"/);
    expect(cspMatch).not.toBeNull();
    const scriptSrcMatch = cspMatch![1].match(/script-src\s+([^;]+)/);
    expect(scriptSrcMatch).not.toBeNull();
    expect(scriptSrcMatch![1]).toContain(expectedToken);
  });
});
