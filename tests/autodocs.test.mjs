import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractDiagram, htmlToDrawio, pathPoints } from '../skills/autodocs/drawio/export-drawio.mjs';
import { markdownToConfluence, storageToHtml } from '../skills/autodocs/docs/confluence.mjs';
import { checkRunbook } from '../skills/autodocs/docs/runbook-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = path.join(root, 'examples/orders-service');
const docs = path.join(sample, 'docs/autodocs');
const cli = path.join(root, 'skills/autodocs/bin/autodocs.mjs');

const read = (file) => fs.readFileSync(file, 'utf8');
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-test-'));

test('architecture HTML exports every node and edge to drawio', () => {
  const html = read(path.join(docs, 'diagrams/architecture.html'));
  const diagram = extractDiagram(html);
  assert.deepEqual(diagram.nodes.map((node) => node.id).sort(), ['api', 'client', 'payments', 'postgres', 'redis', 'worker']);
  assert.equal(diagram.edges.length, 6);

  const xml = htmlToDrawio(html, { title: 'Architecture' });
  assert.match(xml, /^<mxfile /);
  const ids = new Set([...xml.matchAll(/<mxCell id="([^"]+)"/g)].map((match) => match[1]));
  for (const match of xml.matchAll(/ (?:source|target)="([^"]+)"/g)) assert.ok(ids.has(match[1]), `edge end ${match[1]} exists`);
  // Every architecture edge starts and ends on a node, so all are attached.
  assert.equal([...xml.matchAll(/edge="1" parent="1" source="[^"]+" target="[^"]+"/g)].length, 6);
});

test('sequence HTML exports lifelines, labelled segments and detached messages', () => {
  const diagram = extractDiagram(read(path.join(docs, 'diagrams/order-payment-flow.html')));
  assert.equal(diagram.nodes.length, 6);
  assert.equal(diagram.edges.length, 12);
  assert.equal(diagram.lifelines.length, 6);
  assert.equal(new Set(diagram.lifelines.map((line) => line.bottom)).size, 1);
  assert.deepEqual(diagram.frames.map((frame) => frame.label).sort(), ['Accept order (synchronous)', 'Charge order (worker)']);
});

test('extractDiagram rejects pages without a diagram', () => {
  assert.throws(() => extractDiagram('<html><body><svg><rect/></svg></body></html>'), /No rendered diagram SVG/);
});

test('pathPoints keeps corners of rounded orthogonal paths', () => {
  assert.deepEqual(pathPoints('M 160 142 L 612 142 Q 620 142 620 150 L 620 238'), [[160, 142], [612, 142], [620, 150], [620, 238]]);
});

test('markdown converts to Confluence storage format', () => {
  const page = markdownToConfluence([
    '---', 'title: Demo runbook', '---', '# Demo', '',
    '## Setup & run', '',
    '1. Install:', '', '   ```sh', '   npm ci && echo "<ok>"', '   ```', '',
    '2. Use **bold**, *em*, `a<b` and [docs](https://example.com).', '',
    '> [!WARNING]', '> Destroys data.', '',
    '| Key | Default |', '|---|---|', '| `PORT` | 8080 |', '',
    '[Architecture](diagrams/architecture.drawio)', '',
    '![Shot](img/shot.png)', '',
    '- [x] done', '- [ ] todo',
  ].join('\n'));
  assert.equal(page.title, 'Demo runbook');
  assert.match(page.xhtml, /^<ac:structured-macro ac:name="toc"/);
  assert.doesNotMatch(page.xhtml, /<h1>/);
  assert.match(page.xhtml, /<h2>Setup &amp; run<\/h2>/);
  assert.match(page.xhtml, /<ac:parameter ac:name="language">bash<\/ac:parameter>.*<!\[CDATA\[npm ci && echo "<ok>"\]\]>/s);
  assert.match(page.xhtml, /<strong>bold<\/strong>, <em>em<\/em>, <code>a&lt;b<\/code> and <a href="https:\/\/example.com">docs<\/a>/);
  assert.match(page.xhtml, /ac:name="warning".*Destroys data\./s);
  assert.match(page.xhtml, /<th>Key<\/th><th>Default<\/th>.*<td><code>PORT<\/code><\/td><td>8080<\/td>/s);
  assert.match(page.xhtml, /ac:name="info".*Diagram: Architecture.*ri:filename="architecture.drawio"/s);
  assert.match(page.xhtml, /<ac:image ac:alt="Shot"><ri:attachment ri:filename="shot.png" \/><\/ac:image>/);
  assert.match(page.xhtml, /<li>☑ done<\/li>\n<li>☐ todo<\/li>/);
  assert.deepEqual(page.attachments.sort(), ['diagrams/architecture.drawio', 'img/shot.png']);
});

test('the sample runbook passes the runbook contract with verified citations', () => {
  const runbookPath = path.join(docs, 'runbook.md');
  const report = checkRunbook(read(runbookPath), { runbookPath, repoRoot: sample });
  assert.deepEqual(report.errors, []);
  assert.ok(report.stats.citations > 20);
});

test('runbook check reports placeholders, bad citations, missing sections and links', () => {
  const runbookPath = path.join(docs, 'runbook.md');
  const broken = read(runbookPath)
    .replace('`src/worker.js:14-19`', '`src/worker.js:14-99`')
    .replace('`src/db.js:4`', '`src/missing.js:4`')
    .replace(/## Troubleshooting[\s\S]*?(?=## Source map)/, '')
    .replace('It does not manage', 'TBD: it does not manage')
    .replace('(diagrams/architecture.html)', '(diagrams/missing.html)');
  const report = checkRunbook(broken, { runbookPath, repoRoot: sample });
  const rules = report.errors.map((error) => error.rule);
  assert.equal(report.ok, false);
  for (const rule of ['citation', 'missing-section', 'placeholder', 'broken-link']) assert.ok(rules.includes(rule), rule);
  assert.ok(report.errors.some((error) => /outside the file \(1-27\)/.test(error.message)));
});

test('bundle writes a Confluence folder and moves check results out of diagrams/', () => {
  const work = tempDir();
  fs.cpSync(sample, work, { recursive: true });
  const docsDir = path.join(work, 'docs/autodocs');
  fs.rmSync(path.join(docsDir, 'confluence'), { recursive: true, force: true });
  // Simulate engine leftovers beside the HTML.
  fs.writeFileSync(path.join(docsDir, 'diagrams/architecture.delivery.json'), '{}');
  fs.writeFileSync(path.join(docsDir, 'diagrams/architecture.finalize-summary.json'), '{}');
  fs.mkdirSync(path.join(docsDir, 'diagrams/review-2'));
  fs.writeFileSync(path.join(docsDir, 'diagrams/review-2/architecture.browser-check.json'), '{}');

  const run = spawnSync(process.execPath, [cli, 'bundle', 'docs/autodocs', '--repo-root', '.', '--json'], { cwd: work, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.diagrams.length, 2);
  assert.equal(result.checksMoved, 3);
  assert.deepEqual(result.confluence.attachments, ['architecture.drawio', 'architecture.html', 'order-payment-flow.drawio', 'order-payment-flow.html']);
  for (const file of ['page.html', 'page.xhtml', 'page.md', 'IMPORT.md']) assert.ok(fs.existsSync(path.join(docsDir, 'confluence', file)), file);

  assert.deepEqual(fs.readdirSync(path.join(docsDir, 'diagrams')).sort(), [
    'README.md', 'architecture.drawio', 'architecture.html', 'architecture.json',
    'order-payment-flow.drawio', 'order-payment-flow.html', 'order-payment-flow.json',
  ]);
  assert.ok(fs.existsSync(path.join(docsDir, '.checks/architecture/architecture.delivery.json')));
  assert.ok(fs.existsSync(path.join(docsDir, '.checks/diagrams/review-2/architecture.browser-check.json')));
  assert.match(read(path.join(docsDir, '.gitignore')), /^\.checks\/$/m);
  assert.match(read(path.join(docsDir, 'confluence/IMPORT.md')), /A\. Copy and paste \(recommended\)/);
});

test('storage format renders as a copy-pasteable HTML page', () => {
  const { xhtml } = markdownToConfluence([
    '# Demo', '', '## Setup', '', '```sh', 'echo "a]]>b"', '```', '',
    '> [!WARNING]', '> Careful.', '', '[Architecture](diagrams/architecture.drawio)',
  ].join('\n'));
  const html = storageToHtml(xhtml, { title: 'Demo runbook' });
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<ac:|<ri:|CDATA/);
  assert.match(html, /<nav class="toc"><ul><li class="toc-2"><a href="#setup">Setup<\/a><\/li><\/ul><\/nav>/);
  assert.match(html, /<h2 id="setup">Setup<\/h2>/);
  assert.match(html, /<pre><code class="language-bash">echo &quot;a]]&gt;b&quot;<\/code><\/pre>/);
  assert.match(html, /class="panel panel-warning".*Careful\./s);
  assert.match(html, /<a href="attachments\/architecture.drawio">architecture.drawio<\/a>/);
});

test('installer copies the skill into a project for Copilot and Claude, and removes it', () => {
  const project = tempDir();
  const install = (...args) => spawnSync(process.execPath, [path.join(root, 'install.mjs'), ...args, '--project', project], { encoding: 'utf8' });
  assert.equal(install('--agent', 'copilot').status, 0);
  assert.equal(install('--agent', 'claude').status, 0);
  assert.ok(fs.existsSync(path.join(project, '.github/skills/autodocs/SKILL.md')));
  assert.ok(fs.existsSync(path.join(project, '.claude/skills/autodocs/bin/autodocs.mjs')));
  assert.match(install('--agent', 'copilot').stdout, /exists/);
  assert.equal(install('--agent', 'copilot', '--uninstall').status, 0);
  assert.ok(!fs.existsSync(path.join(project, '.github/skills/autodocs')));
});

test('SKILL.md front matter is valid for Copilot and Claude skill loaders', () => {
  const skill = read(path.join(root, 'skills/autodocs/SKILL.md'));
  const front = /^---\n([\s\S]*?)\n---\n/.exec(skill)[1];
  assert.match(front, /^name: autodocs$/m);
  const description = /^description: "(.*)"$/m.exec(front)[1];
  assert.ok(description.length <= 1024, `description is ${description.length} chars`);
});
