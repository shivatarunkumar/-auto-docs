import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { embedDiagrams, filesSection, markdownToConfluence } from '../skills/autodocs/docs/confluence.mjs';
import { hasManagedBlock, managedBlock, mergeManagedBlock, parsePageRef } from '../skills/autodocs/docs/confluence-publish.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'skills/autodocs/bin/autodocs.mjs');
const sample = path.join(root, 'examples/orders-service');
const TOKEN = 'secret-token-value';
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-publish-'));

// An in-memory stand-in for the Confluence Cloud endpoints the publisher uses.
async function mockConfluence(t) {
  const site = { pages: new Map(), attachments: [], nextId: 1000, requests: [], failUpload: false, rate: 0 };
  const expected = `Basic ${Buffer.from(`me@example.com:${TOKEN}`).toString('base64')}`;
  const pageJson = (page) => ({ ...page, body: { storage: { value: page.body, representation: 'storage' } }, version: { number: page.version }, _links: { webui: `/spaces/ENG/pages/${page.id}` } });
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://x');
    site.requests.push(`${req.method} ${url.pathname}`);
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.authorization !== expected) return send(401, { message: 'nope' });
    if (url.pathname === '/wiki/rest/api/user/current') return send(200, { accountId: 'a1', displayName: 'Me' });
    if (url.pathname === '/wiki/api/v2/spaces') return send(200, { results: url.searchParams.get('keys') === 'ENG' ? [{ id: '77', key: 'ENG' }] : [] });
    if (req.method === 'GET' && url.pathname === '/wiki/api/v2/pages') {
      return send(200, { results: [...site.pages.values()].filter((page) => page.title === url.searchParams.get('title')).map(pageJson) });
    }
    if (req.method === 'POST' && url.pathname === '/wiki/api/v2/pages') {
      const input = JSON.parse(raw);
      const page = { id: String(site.nextId++), title: input.title, parentId: input.parentId, spaceId: input.spaceId, body: input.body.value, version: 1 };
      site.pages.set(page.id, page);
      return send(200, pageJson(page));
    }
    const attachment = /^\/wiki\/rest\/api\/content\/(\d+)\/child\/attachment$/.exec(url.pathname);
    if (attachment && req.method === 'PUT') {
      if (req.headers['x-atlassian-token'] !== 'nocheck') return send(403, { message: 'xsrf' });
      if (site.rate > 0) { site.rate -= 1; res.writeHead(429, { 'retry-after': '0' }); return res.end(); }
      if (site.failUpload) return send(400, { message: 'too big' });
      site.attachments.push({ pageId: attachment[1], name: /filename="([^"]+)"/.exec(raw.toString('latin1'))[1] });
      return send(200, { results: [] });
    }
    const pageMatch = /^\/wiki\/api\/v2\/pages\/(\d+)$/.exec(url.pathname);
    const page = pageMatch && site.pages.get(pageMatch[1]);
    if (!page) return send(404, { message: 'missing' });
    if (req.method === 'GET') return send(200, pageJson(page));
    const input = JSON.parse(raw);
    if (input.version.number !== page.version + 1) return send(409, { message: 'stale' });
    // Confluence adds macro ids when it stores a page.
    Object.assign(page, { title: input.title, body: input.body.value.replace(/ac:name="anchor"(?! ac:macro-id)/g, 'ac:name="anchor" ac:macro-id="abc"'), version: input.version.number });
    return send(200, pageJson(page));
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  t.after(() => server.close());
  site.baseUrl = `http://127.0.0.1:${server.address().port}`;
  site.addPage = (body, title = 'Team notes') => {
    const page = { id: String(site.nextId++), title, body, version: 3 };
    site.pages.set(page.id, page);
    return page;
  };
  return site;
}

function setup(site) {
  const work = tempDir();
  fs.cpSync(path.join(sample, 'docs/autodocs'), path.join(work, 'docs/autodocs'), { recursive: true });
  const docs = path.join(work, 'docs/autodocs');
  const run = (args, { input, withToken = true } = {}) => new Promise((resolve) => {
    const env = { ...process.env, AUTODOCS_CONFIG_DIR: path.join(work, 'config'), AUTODOCS_CREDENTIAL_STORE: 'file', CONFLUENCE_BASE_URL: '', CONFLUENCE_USER: '', CONFLUENCE_API_TOKEN: '' };
    if (withToken) Object.assign(env, { CONFLUENCE_BASE_URL: site.baseUrl, CONFLUENCE_USER: 'me@example.com', CONFLUENCE_API_TOKEN: TOKEN });
    const child = execFile(process.execPath, [cli, ...args], { cwd: work, env, encoding: 'utf8' }, (error, stdout, stderr) => resolve({ status: error ? error.code : 0, stdout, stderr }));
    child.stdin.end(input ?? '');
  });
  return { work, docs, run };
}

const publishNew = (run, ...extra) => run(['confluence', 'publish', 'docs/autodocs', '--new', '--space', 'ENG', '--yes', '--json', ...extra]);

test('diagram panels become images with the draw.io file linked', () => {
  const { xhtml } = markdownToConfluence('# T\n\n[Architecture](diagrams/architecture.drawio)\n\n[Flow](diagrams/flow.drawio)\n');
  const files = new Set(['architecture.png', 'architecture.html', 'architecture.drawio']);
  const result = embedDiagrams(xhtml, (name) => files.has(name));
  assert.deepEqual(result.embedded, ['architecture.drawio']);
  assert.deepEqual(result.missing, ['flow.drawio']);
  assert.match(result.xhtml, /<ac:image ac:alt="Architecture" ac:width="760"><ri:attachment ri:filename="architecture.png" \/>/);
  assert.doesNotMatch(result.xhtml, /Diagram: Architecture/);
  assert.match(result.xhtml, /Diagram: Flow/);
});

test('the files table links every diagram format and the runbook', () => {
  const html = filesSection(['a-flow.drawio', 'a-flow.html', 'a-flow.png', 'b.drawio', 'runbook.md', 'notes.txt']);
  assert.match(html, /<td>A flow<\/td>/);
  for (const name of ['a-flow.drawio', 'a-flow.html', 'a-flow.png', 'b.drawio', 'runbook.md', 'notes.txt']) assert.ok(html.includes(`ri:filename="${name}"`), name);
  assert.ok(!html.includes('ri:filename="b.html"'), 'no link to a file that was not attached');
  assert.equal(filesSection([]), '');
});

test('a diagram linked beside other text still gets its picture once', () => {
  const { xhtml } = markdownToConfluence('# T\n\n[A](d/a.drawio) · [view](d/a.html)\n\nAgain [A](d/a.drawio).\n');
  const result = embedDiagrams(xhtml, () => true);
  assert.equal([...result.xhtml.matchAll(/<ac:image/g)].length, 1);
  assert.deepEqual(result.embedded, ['a.drawio']);
});

test('the managed block keeps content outside it, including $ patterns', () => {
  const block = (text) => managedBlock(`<p>${text}</p>`, { revision: 'abcdef0123', date: '2026-11-08' });
  const first = mergeManagedBlock('<p>Owner intro</p>', block('v1'));
  assert.equal(first.replacedBlock, false);
  assert.ok(first.body.startsWith('<p>Owner intro</p>\n'));
  const stored = `${first.body.replace(/ac:name="anchor"/g, 'ac:macro-id="9" ac:name="anchor"')}<p>Owner footer</p>`;
  assert.ok(hasManagedBlock(stored));
  const second = mergeManagedBlock(stored, block("cost $& $' v2"));
  assert.equal(second.replacedBlock, true);
  assert.match(second.body, /^<p>Owner intro<\/p>/);
  assert.match(second.body, /<p>Owner footer<\/p>$/);
  assert.match(second.body, /cost \$& \$' v2/);
  assert.doesNotMatch(second.body, /v1/);
});

test('damaged or missing markers stop the merge instead of duplicating content', () => {
  const block = managedBlock('<p>x</p>', {});
  const onlyStart = block.split('\n')[0];
  assert.throws(() => mergeManagedBlock(`<p>a</p>${onlyStart}`, block), /incomplete or out of order/);
  assert.throws(() => mergeManagedBlock('<p>a</p>', block, { requireMarkers: true }), /markers are gone/);
});

test('a page with columns keeps its layout as the root', () => {
  const page = '<ac:layout><ac:layout-section><ac:layout-cell><p>a</p></ac:layout-cell></ac:layout-section></ac:layout>';
  const { body } = mergeManagedBlock(page, '<p>block</p>');
  assert.equal(body, '<ac:layout><ac:layout-section><ac:layout-cell><p>a</p><p>block</p></ac:layout-cell></ac:layout-section></ac:layout>');
});

test('page references resolve from links and reject other sites', () => {
  const base = 'https://acme.atlassian.net';
  assert.equal(parsePageRef('123', base), '123');
  assert.equal(parsePageRef(`${base}/wiki/spaces/ENG/pages/456/My+Page`, base), '456');
  assert.equal(parsePageRef(`${base}/wiki/spaces/ENG/pages/edit-v2/789`, base), '789');
  assert.equal(parsePageRef(`${base}/wiki/pages/viewpage.action?pageId=321`, base), '321');
  assert.throws(() => parsePageRef('https://evil.example/wiki/spaces/ENG/pages/1', base), /saved Confluence site/);
  assert.throws(() => parsePageRef(`${base}/wiki/x/AbCd`, base), /Short/);
});

test('login verifies, stores privately, and is reused without asking again', async (t) => {
  const site = await mockConfluence(t);
  const { work, run } = setup(site);
  const login = ['confluence', 'login', '--base-url', site.baseUrl, '--email', 'me@example.com', '--token-stdin'];

  const bad = await run(login, { input: 'wrong-token\n', withToken: false });
  assert.equal(bad.status, 4);
  assert.equal(fs.existsSync(path.join(work, 'config/confluence.json')), false);
  assert.equal((await run(['confluence', 'status', '--json'], { withToken: false })).status, 3);

  const good = await run(login, { input: `${TOKEN}\n`, withToken: false });
  assert.equal(good.status, 0, good.stderr);
  assert.ok(!good.stdout.includes(TOKEN));
  assert.equal(fs.statSync(path.join(work, 'config/confluence.json')).mode & 0o777, 0o600);

  const status = await run(['confluence', 'status', '--verify', '--json'], { withToken: false });
  assert.equal(status.status, 0, status.stderr);
  assert.ok(!status.stdout.includes(TOKEN));
  assert.equal(JSON.parse(status.stdout).user, 'Me');

  const published = await publishNew((args) => run(args, { withToken: false }));
  assert.equal(published.status, 0, published.stderr + published.stdout);

  assert.equal((await run(['confluence', 'logout'], { withToken: false })).status, 0);
  assert.equal((await run(['confluence', 'status', '--json'], { withToken: false })).status, 3);
});

test('publish refuses to run without a target, a mode flag, or credentials', async (t) => {
  const site = await mockConfluence(t);
  const { run } = setup(site);
  const none = await run(['confluence', 'publish', 'docs/autodocs', '--yes', '--json']);
  assert.equal(none.status, 3);
  assert.equal(JSON.parse(none.stdout).code, 'target-required');
  assert.equal((await run(['confluence', 'publish', 'docs/autodocs'])).status, 2);
  const noCreds = await run(['confluence', 'publish', 'docs/autodocs', '--yes', '--json'], { withToken: false });
  assert.equal(JSON.parse(noCreds.stdout).code, 'credentials-missing');
});

test('dry run reads but changes nothing', async (t) => {
  const site = await mockConfluence(t);
  const { docs, run } = setup(site);
  const result = await run(['confluence', 'publish', 'docs/autodocs', '--new', '--space', 'ENG', '--dry-run', '--json']);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(JSON.parse(result.stdout).applied, false);
  assert.equal(site.pages.size, 0);
  assert.ok(site.requests.every((request) => request.startsWith('GET ')));
  assert.equal(fs.existsSync(path.join(docs, '.confluence.json')), false);
});

test('a new page gets attachments and diagrams, and later runs update the same page', async (t) => {
  const site = await mockConfluence(t);
  const { docs, run } = setup(site);
  const result = JSON.parse((await publishNew(run)).stdout);
  assert.equal(result.applied, true);
  const page = site.pages.get(result.pageId);
  assert.equal(site.pages.size, 1);
  assert.equal(page.version, 2);
  assert.ok(hasManagedBlock(page.body));
  assert.ok(page.body.includes('<ac:image'), 'diagram shown as an image');
  for (const name of ['architecture.drawio', 'architecture.png']) assert.ok(site.attachments.some((item) => item.name === name), name);
  const firstBodyWrite = site.requests.indexOf(`PUT /wiki/api/v2/pages/${result.pageId}`);
  const lastUpload = site.requests.lastIndexOf(`PUT /wiki/rest/api/content/${result.pageId}/child/attachment`);
  assert.ok(lastUpload < firstBodyWrite, 'attachments exist before the body refers to them');

  const state = fs.readFileSync(path.join(docs, '.confluence.json'), 'utf8');
  assert.ok(!state.includes(TOKEN));
  assert.equal(JSON.parse(state).pageId, result.pageId);

  page.body = `<p>Written by a person</p>${page.body}`;
  const again = await run(['confluence', 'publish', 'docs/autodocs', '--yes', '--json']);
  assert.equal(again.status, 0, again.stderr + again.stdout);
  assert.equal(site.pages.size, 1);
  assert.equal(page.version, 3);
  assert.match(page.body, /^<p>Written by a person<\/p>/);
  assert.equal([...page.body.matchAll(/autodocs-start/g)].length, 1);
});

test('publishing into an existing page keeps it by default and replaces it only on request', async (t) => {
  const site = await mockConfluence(t);
  const { run } = setup(site);
  const page = site.addPage('<p>Keep me</p>');
  const url = `${site.baseUrl}/wiki/spaces/ENG/pages/${page.id}/Team+notes`;
  const managed = await run(['confluence', 'publish', 'docs/autodocs', '--page', url, '--yes', '--json']);
  assert.equal(managed.status, 0, managed.stderr + managed.stdout);
  assert.match(page.body, /^<p>Keep me<\/p>/);
  assert.equal(page.title, 'Team notes');
  assert.equal(page.version, 4);

  const replaced = await run(['confluence', 'publish', 'docs/autodocs', '--page', url, '--mode', 'replace', '--yes', '--json']);
  assert.equal(replaced.status, 0, replaced.stderr + replaced.stdout);
  assert.doesNotMatch(page.body, /Keep me/);
  assert.ok(hasManagedBlock(page.body));
});

test('a removed managed block stops the next publish', async (t) => {
  const site = await mockConfluence(t);
  const { run } = setup(site);
  const { pageId } = JSON.parse((await publishNew(run)).stdout);
  site.pages.get(pageId).body = '<p>Someone rewrote this page</p>';
  const result = await run(['confluence', 'publish', 'docs/autodocs', '--yes', '--json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).code, 'markers-missing');
  assert.equal(site.pages.get(pageId).body, '<p>Someone rewrote this page</p>');
});

test('a clashing title is reported before anything is created', async (t) => {
  const site = await mockConfluence(t);
  const { docs, run } = setup(site);
  const title = /^title: (.*)$/m.exec(fs.readFileSync(path.join(docs, 'runbook.md'), 'utf8'))[1];
  site.addPage('<p>x</p>', title);
  const result = await publishNew(run);
  assert.equal(JSON.parse(result.stdout).code, 'title-exists');
  assert.equal(site.pages.size, 1);
});

test('a failed upload is retried on the same page, and rate limits are waited out', async (t) => {
  const site = await mockConfluence(t);
  const { run } = setup(site);
  site.failUpload = true;
  const failed = await publishNew(run);
  assert.equal(failed.status, 1);
  assert.equal(site.pages.size, 1);

  site.failUpload = false;
  site.rate = 2;
  const retried = await run(['confluence', 'publish', 'docs/autodocs', '--yes', '--json']);
  assert.equal(retried.status, 0, retried.stderr + retried.stdout);
  assert.equal(site.pages.size, 1);
  const [page] = site.pages.values();
  assert.ok(hasManagedBlock(page.body));
  assert.doesNotMatch(page.body, /Publishing with autodocs/);
});

test('a rejected token reports exit 4 and never prints the token', async (t) => {
  const site = await mockConfluence(t);
  const { work, run } = setup(site);
  fs.mkdirSync(path.join(work, 'config'));
  fs.writeFileSync(path.join(work, 'config/confluence.json'), JSON.stringify({ baseUrl: site.baseUrl, email: 'me@example.com', token: 'expired-token' }));
  const result = await publishNew((args) => run(args, { withToken: false }));
  assert.equal(result.status, 4);
  assert.equal(JSON.parse(result.stdout).code, 'auth');
  assert.ok(!(result.stdout + result.stderr).includes('expired-token'));
});

test('a plain-language page.md is what readers get, with every file attached and listed', async (t) => {
  const site = await mockConfluence(t);
  const { work, docs, run } = setup(site);
  fs.cpSync(sample, work, { recursive: true });
  fs.writeFileSync(path.join(docs, 'page.md'), '---\ntitle: Orders\n---\n\n# Orders\n\n## What is this?\n\nIt takes orders.\n\n[How an order moves](diagrams/architecture.drawio)\n');
  const bundled = await run(['bundle', 'docs/autodocs', '--repo-root', '.', '--no-png', '--json']);
  assert.equal(bundled.status, 0, bundled.stdout + bundled.stderr);
  for (const stem of ['architecture', 'order-payment-flow']) fs.writeFileSync(path.join(docs, `confluence/attachments/${stem}.png`), 'png');

  const { pageId } = JSON.parse((await publishNew(run)).stdout);
  const page = site.pages.get(pageId);
  assert.equal(page.title, 'Orders');
  assert.match(page.body, /It takes orders\./);
  assert.doesNotMatch(page.body, /Troubleshooting/);
  assert.doesNotMatch(page.body, /ac:name="toc"/);
  assert.match(page.body, /<ac:image ac:alt="How an order moves"/);
  assert.match(page.body, /<h2>Files<\/h2>/);
  assert.match(page.body, /<td>Order payment flow<\/td>/);
  assert.match(page.body, /ri:filename="runbook.md"/);
  const uploaded = site.attachments.map((item) => item.name).sort();
  assert.deepEqual(uploaded, ['architecture.drawio', 'architecture.html', 'architecture.png', 'order-payment-flow.drawio', 'order-payment-flow.html', 'order-payment-flow.png', 'runbook.md']);
});

test('publish refuses a bundle with no files rather than uploading a bare page', async (t) => {
  const site = await mockConfluence(t);
  const { docs, run } = setup(site);
  fs.rmSync(path.join(docs, 'confluence/attachments'), { recursive: true });
  const result = await publishNew(run);
  assert.equal(JSON.parse(result.stdout).code, 'no-attachments');
  assert.equal(site.pages.size, 0);
});
