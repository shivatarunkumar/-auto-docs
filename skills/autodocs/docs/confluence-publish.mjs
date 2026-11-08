// Publishes a bundled docs folder (<docs>/confluence/) to Confluence Cloud:
// stored credentials, page create/update through REST API v2, and attachment
// upload through REST API v1 (v2 has no upload endpoint).
//
// The token is never written to the repository, printed, or passed on a
// command line. The publish target is remembered in <docs>/.confluence.json,
// which holds no secrets and can be committed so a team shares one page.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { embedDiagrams, escapeXml, filesSection, parseFrontMatter } from './confluence.mjs';

const KEYCHAIN_SERVICE = 'autodocs-confluence';
const START_MARKER = 'autodocs-start';
const END_MARKER = 'autodocs-end';
// A page needs a body to be created; attachments must exist before the real one.
const STUB_BODY = '<p>Publishing with autodocs…</p>';
export const STATE_FILE = '.confluence.json';

export class PublishError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

// ---- Credentials ------------------------------------------------------------

function configFile(env) {
  const base = env.AUTODOCS_CONFIG_DIR
    ?? path.join(env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'autodocs');
  return path.join(base, 'confluence.json');
}

function readConfig(env) {
  try {
    return JSON.parse(fs.readFileSync(configFile(env), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(env, data) {
  const file = configFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

const usesKeychain = (env) => process.platform === 'darwin' && env.AUTODOCS_CREDENTIAL_STORE !== 'file';

function keychainRead(account) {
  const run = spawnSync('security', ['find-generic-password', '-a', account, '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8' });
  return run.status === 0 ? run.stdout.replace(/\n$/, '') : '';
}

function keychainWrite(account, token) {
  // `security -i` reads the command from stdin, which keeps the token out of
  // the process list. It exits 0 even when a command fails, so read it back.
  const quote = (value) => `"${value.replace(/(["\\])/g, '\\$1')}"`;
  spawnSync('security', ['-i'], { input: `add-generic-password -U -a ${quote(account)} -s ${KEYCHAIN_SERVICE} -w ${quote(token)}\n`, encoding: 'utf8' });
  if (keychainRead(account) !== token) throw new PublishError('keychain', 'Could not save the token to macOS Keychain.');
}

export function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new PublishError('invalid-url', `Not a valid Confluence site URL: ${value}`, 2);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new PublishError('invalid-url', 'The Confluence site URL must use https, because the token is sent to it.', 2);
  return url.origin;
}

export function resolveCredentials(env = process.env) {
  const config = readConfig(env);
  const rawUrl = env.CONFLUENCE_BASE_URL || config.baseUrl || '';
  const baseUrl = rawUrl ? normalizeBaseUrl(rawUrl) : '';
  const email = env.CONFLUENCE_USER || config.email || '';
  let token = env.CONFLUENCE_API_TOKEN || '';
  let tokenSource = token ? 'environment' : null;
  if (!token && email && usesKeychain(env)) {
    token = keychainRead(email);
    if (token) tokenSource = 'keychain';
  }
  if (!token && config.token) {
    token = config.token;
    tokenSource = 'config-file';
  }
  const missing = [!baseUrl && 'site URL', !email && 'email', !token && 'API token'].filter(Boolean);
  return { baseUrl, email, token, tokenSource, missing };
}

export function saveCredentials({ baseUrl, email, token }, env = process.env) {
  if (/[\r\n]/.test(token)) throw new PublishError('invalid-token', 'The token contains a line break.', 2);
  if (usesKeychain(env)) {
    keychainWrite(email, token);
    writeConfig(env, { baseUrl, email });
    return 'keychain';
  }
  writeConfig(env, { baseUrl, email, token });
  return 'config-file';
}

export function deleteCredentials(env = process.env) {
  const config = readConfig(env);
  if (config.email && usesKeychain(env)) {
    spawnSync('security', ['delete-generic-password', '-a', config.email, '-s', KEYCHAIN_SERVICE], { encoding: 'utf8' });
  }
  fs.rmSync(configFile(env), { force: true });
}

// ---- REST client ------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export function createClient({ baseUrl, email, token }) {
  const authorization = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

  async function call(method, apiPath, { json, form } = {}) {
    const headers = { Authorization: authorization, Accept: 'application/json' };
    if (json) headers['Content-Type'] = 'application/json';
    if (form) headers['X-Atlassian-Token'] = 'nocheck';
    for (let attempt = 0; ; attempt += 1) {
      let response;
      try {
        response = await fetch(`${baseUrl}${apiPath}`, { method, headers, body: json ? JSON.stringify(json) : form });
      } catch (error) {
        throw new PublishError('network', `Could not reach ${baseUrl}: ${error.cause?.message ?? error.message}`);
      }
      // A POST that failed on the server may still have created the page.
      const retryable = response.status === 429 || (response.status >= 500 && method !== 'POST');
      if (retryable && attempt < 3) {
        const header = Number(response.headers.get('retry-after') ?? NaN);
        await sleep(Math.min(Number.isFinite(header) ? header : 2 ** attempt, 30) * 1000);
        continue;
      }
      const text = await response.text();
      if (response.ok) return text ? JSON.parse(text) : null;
      throw httpError(response.status, method, apiPath, text);
    }
  }

  return {
    currentUser: () => call('GET', '/wiki/rest/api/user/current'),
    getPage: (id) => call('GET', `/wiki/api/v2/pages/${id}?body-format=storage`),
    findSpace: async (key) => (await call('GET', `/wiki/api/v2/spaces?keys=${encodeURIComponent(key)}`)).results?.[0] ?? null,
    findPages: async (spaceId, title) => (await call('GET', `/wiki/api/v2/pages?space-id=${spaceId}&status=current&title=${encodeURIComponent(title)}`)).results ?? [],
    createPage: ({ spaceId, parentId, title, body }) => call('POST', '/wiki/api/v2/pages', {
      json: { spaceId, status: 'current', title, ...(parentId ? { parentId } : {}), body: { representation: 'storage', value: body } },
    }),
    updatePage: ({ id, title, body, version }) => call('PUT', `/wiki/api/v2/pages/${id}`, {
      json: { id, status: 'current', title, body: { representation: 'storage', value: body }, version: { number: version } },
    }),
    uploadAttachment: (pageId, name, bytes) => {
      const form = new FormData();
      form.append('file', new Blob([bytes]), name);
      form.append('minorEdit', 'true');
      return call('PUT', `/wiki/rest/api/content/${pageId}/child/attachment`, { form });
    },
  };
}

function httpError(status, method, apiPath, text) {
  const where = `${method} ${apiPath.split('?')[0]}`;
  if (status === 401) return new PublishError('auth', 'Confluence rejected the credentials (401). Check the site URL and email, or create a new API token and log in again. Only Confluence Cloud is supported.', 4);
  if (status === 403) return new PublishError('forbidden', `This account may not do that (403, ${where}).`);
  if (status === 404) return new PublishError('not-found', `Not found, or this account cannot see it (404, ${where}).`);
  if (status === 409) return new PublishError('conflict', 'The page changed while publishing (409). Run the publish again.');
  return new PublishError('http', `Confluence returned ${status} for ${where}: ${text.slice(0, 300)}`);
}

export async function verifyCredentials(credentials) {
  const user = await createClient(credentials).currentUser();
  // Cloud can answer a bad login with an anonymous user instead of a 401.
  if (!user?.accountId || user.type === 'anonymous') throw new PublishError('auth', 'Confluence did not accept these credentials. Check the site URL, email and token.', 4);
  return user.displayName ?? user.accountId;
}

// ---- Page body --------------------------------------------------------------

const anchorMacro = (name) => `<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">${name}</ac:parameter></ac:structured-macro>`;
// Confluence adds attributes such as ac:macro-id when it stores a macro.
const anchorPattern = (name) => new RegExp(`<ac:structured-macro\\b[^>]*ac:name="anchor"[^>]*>\\s*<ac:parameter\\b[^>]*>${name}</ac:parameter>\\s*</ac:structured-macro>`, 'g');

export function managedBlock(xhtml, { repository, revision, date }) {
  const updated = [date && ` on ${date}`, revision && ` (version ${revision.slice(0, 8)})`].filter(Boolean).join('');
  const stamp = `<p><em>This section is updated automatically from the code${escapeXml(updated)}. Anything changed here will be replaced, so add your own notes above or below it.</em></p>`;
  return `${anchorMacro(START_MARKER)}\n${stamp}\n${xhtml.trim()}\n${anchorMacro(END_MARKER)}`;
}

export function hasManagedBlock(body) {
  return [...body.matchAll(anchorPattern(START_MARKER))].length === 1 && [...body.matchAll(anchorPattern(END_MARKER))].length === 1;
}

// Puts the block into an existing body and leaves everything outside it alone.
export function mergeManagedBlock(existing, block, { requireMarkers = false } = {}) {
  const starts = [...existing.matchAll(anchorPattern(START_MARKER))];
  const ends = [...existing.matchAll(anchorPattern(END_MARKER))];
  const replaceHint = 'Restore the markers in the page history, or publish again with --mode replace to overwrite the whole page.';
  if (starts.length || ends.length) {
    if (starts.length !== 1 || ends.length !== 1 || starts[0].index > ends[0].index) {
      throw new PublishError('markers-damaged', `The autodocs markers on this page are incomplete or out of order. ${replaceHint}`);
    }
    return {
      body: existing.slice(0, starts[0].index) + block + existing.slice(ends[0].index + ends[0][0].length),
      replacedBlock: true,
    };
  }
  if (requireMarkers) throw new PublishError('markers-missing', `autodocs published to this page before, but its markers are gone. Adding another block would duplicate the content. ${replaceHint}`);
  if (existing === STUB_BODY || existing.trim() === '') return { body: block, replacedBlock: false };
  // A page with columns must keep <ac:layout> as its only root element.
  const lastCell = existing.lastIndexOf('</ac:layout-cell>');
  if (lastCell >= 0) return { body: `${existing.slice(0, lastCell)}${block}${existing.slice(lastCell)}`, replacedBlock: false };
  return { body: `${existing}\n${block}`, replacedBlock: false };
}

export function parsePageRef(ref, baseUrl) {
  if (/^\d+$/.test(ref)) return ref;
  let url;
  try {
    url = new URL(ref);
  } catch {
    throw new PublishError('invalid-page', `Not a page URL or numeric page ID: ${ref}`, 2);
  }
  if (url.origin !== baseUrl) throw new PublishError('wrong-site', `That page is on ${url.origin}, but the saved Confluence site is ${baseUrl}.`, 2);
  const id = /\/pages\/(?:edit(?:-v2)?\/)?(\d+)/.exec(url.pathname)?.[1] ?? url.searchParams.get('pageId');
  if (!id || !/^\d+$/.test(id)) throw new PublishError('invalid-page', 'Could not find a page ID in that link. Short /wiki/x/ links have none; copy the full address from the browser bar.', 2);
  return id;
}

// ---- Publish ----------------------------------------------------------------

function loadBundle(docsDir) {
  const dir = path.join(docsDir, 'confluence');
  const pageFile = path.join(dir, 'page.xhtml');
  const runbook = path.join(docsDir, 'runbook.md');
  if (!fs.existsSync(pageFile) || !fs.existsSync(runbook)) throw new PublishError('no-bundle', `No Confluence bundle in ${docsDir}. Run: autodocs bundle ${docsDir} --repo-root .`, 2);
  const attachmentsDir = path.join(dir, 'attachments');
  const attachments = fs.existsSync(attachmentsDir) ? fs.readdirSync(attachmentsDir).filter((name) => !name.startsWith('.')).sort() : [];
  const runbookData = parseFrontMatter(fs.readFileSync(runbook, 'utf8')).data;
  const friendly = path.join(docsDir, 'page.md');
  const source = fs.existsSync(friendly) ? parseFrontMatter(fs.readFileSync(friendly, 'utf8')) : parseFrontMatter(fs.readFileSync(runbook, 'utf8'));
  const data = { ...runbookData, ...source.data };
  const { body } = source;
  return {
    xhtml: fs.readFileSync(pageFile, 'utf8'),
    attachmentsDir,
    attachments,
    title: data.title || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || 'Runbook',
    repository: data.repository ?? '',
    revision: data.revision ?? '',
  };
}

function readState(docsDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(docsDir, STATE_FILE), 'utf8'));
  } catch {
    return null;
  }
}

function writeState(docsDir, state) {
  fs.writeFileSync(path.join(docsDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function worktreeWarnings(repoRoot, docsDir, bundle) {
  const git = (...args) => spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  const head = git('rev-parse', 'HEAD');
  if (head.status !== 0) return [];
  const warnings = [];
  if (bundle.revision && bundle.revision !== head.stdout.trim()) warnings.push(`The docs were generated at ${bundle.revision.slice(0, 8)}, but the repository is at ${head.stdout.trim().slice(0, 8)}.`);
  const docs = path.relative(path.resolve(repoRoot), path.resolve(docsDir)) || '.';
  const dirty = git('status', '--porcelain', '--', '.', `:(exclude)${docs}`).stdout.trim();
  if (dirty) warnings.push(`The repository has ${dirty.split('\n').length} uncommitted change(s) that the published docs do not reflect.`);
  return warnings;
}

const webUrl = (baseUrl, page) => (page._links?.webui ? `${baseUrl}/wiki${page._links.webui}` : `${baseUrl}/wiki/pages/viewpage.action?pageId=${page.id}`);

// target: { page, isNew, space, parent, title }. Nothing is written unless apply is true.
export async function publish({ docsDir, repoRoot = '.', target = {}, mode = 'managed', apply = false, credentials, now = new Date() }) {
  const client = createClient(credentials);
  const { baseUrl } = credentials;
  const bundle = loadBundle(docsDir);
  if (!bundle.attachments.length) throw new PublishError('no-attachments', `No files found in ${bundle.attachmentsDir}. Run bundle again before publishing.`, 2);
  const state = readState(docsDir);
  const warnings = worktreeWarnings(repoRoot, docsDir, bundle);

  const embedded = embedDiagrams(bundle.xhtml, (name) => bundle.attachments.includes(name));
  if (embedded.missing.length) warnings.push(`No PNG for ${embedded.missing.join(', ')}; the page shows a link to the draw.io file instead of a picture.`);
  const block = managedBlock(`${embedded.xhtml.trim()}\n${filesSection(bundle.attachments)}`, { repository: bundle.repository, revision: bundle.revision, date: now.toISOString().slice(0, 10) });

  let pageId = target.page ? parsePageRef(target.page, baseUrl) : null;
  if (!pageId && !target.isNew) {
    if (!state?.pageId) throw new PublishError('target-required', 'No page chosen yet. Use --new --space <KEY> [--parent <page>] to create one, or --page <url> to publish into an existing page.', 3);
    if (state.baseUrl !== baseUrl) throw new PublishError('wrong-site', `This folder publishes to ${state.baseUrl}, but the saved Confluence site is ${baseUrl}. Use --page or --new to choose a page on this site.`, 2);
    pageId = state.pageId;
  }

  const body = (existing, requireMarkers) => (mode === 'replace' ? { body: block, replacedBlock: false } : mergeManagedBlock(existing, block, { requireMarkers }));
  const requireMarkers = Boolean(state?.publishedAt && state.pageId === pageId);
  const plan = { mode, attachments: bundle.attachments, diagramsEmbedded: embedded.embedded, warnings };
  let space = null;
  let parentId = null;

  if (pageId) {
    const page = await client.getPage(pageId);
    const merged = body(page.body?.storage?.value ?? '', requireMarkers);
    Object.assign(plan, {
      action: 'update',
      pageId,
      title: target.title || page.title,
      url: webUrl(baseUrl, page),
      currentVersion: page.version?.number,
      effect: mode === 'replace' ? 'replaces the whole page'
        : merged.replacedBlock ? 'replaces the autodocs block and keeps everything else on the page'
          : 'adds the autodocs block and keeps everything else on the page',
    });
  } else {
    space = await client.findSpace(target.space);
    if (!space) throw new PublishError('not-found', `Space ${target.space} was not found, or this account cannot see it.`);
    parentId = target.parent ? parsePageRef(target.parent, baseUrl) : null;
    const title = target.title || bundle.title;
    const clash = await client.findPages(space.id, title);
    if (clash.length) throw new PublishError('title-exists', `Space ${target.space} already has a page titled "${title}". Publish into it with --page ${webUrl(baseUrl, clash[0])}, or pick another name with --title.`);
    if (state?.pageId) warnings.push(`This folder currently publishes to page ${state.pageId}; a new page will take its place as the target.`);
    Object.assign(plan, { action: 'create', space: target.space, parentId, title, effect: 'creates a new page' });
  }

  if (!apply) return { applied: false, plan };

  if (plan.action === 'create') {
    const created = await client.createPage({ spaceId: space.id, parentId, title: plan.title, body: STUB_BODY });
    pageId = String(created.id);
    // Saved now so a failed upload is retried on this page, not a duplicate.
    writeState(docsDir, { baseUrl, pageId, title: plan.title, url: webUrl(baseUrl, created), mode });
  }

  // Attachments first: the body refers to them by name.
  for (const name of bundle.attachments) {
    await client.uploadAttachment(pageId, name, fs.readFileSync(path.join(bundle.attachmentsDir, name)));
  }

  // Read the page again so edits made during the upload are kept.
  const latest = await client.getPage(pageId);
  const merged = body(latest.body?.storage?.value ?? '', requireMarkers);
  const updated = await client.updatePage({ id: pageId, title: plan.title, body: merged.body, version: latest.version.number + 1 });

  const stored = await client.getPage(pageId);
  if (!hasManagedBlock(stored.body?.storage?.value ?? '')) warnings.push('Confluence did not keep the autodocs markers, so the next publish will need --mode replace.');
  const url = webUrl(baseUrl, updated._links?.webui ? updated : stored);
  writeState(docsDir, { baseUrl, pageId, title: plan.title, url, mode, revision: bundle.revision, publishedAt: now.toISOString() });
  return { applied: true, plan, pageId, url, version: updated.version?.number, attachmentsUploaded: bundle.attachments.length };
}
