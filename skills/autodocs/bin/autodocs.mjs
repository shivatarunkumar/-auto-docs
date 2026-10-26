#!/usr/bin/env node
// autodocs CLI. Documentation commands live here; every other command
// (finalize, validate, render, guide, doctor, ...) is passed to the diagram
// engine in bin/engine.mjs unchanged.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDiagram, htmlToDrawio } from '../drawio/export-drawio.mjs';
import { markdownToConfluence, storageToHtml } from '../docs/confluence.mjs';
import { checkRunbook } from '../docs/runbook-check.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engine = path.join(__dirname, 'engine.mjs');

const USAGE = `autodocs — architecture diagrams, draw.io files, runbooks and Confluence pages

Documentation commands:
  autodocs drawio <diagram.html> [--out <file.drawio>] [--title <name>]
      Convert a rendered diagram into an editable draw.io file.
  autodocs runbook check <runbook.md> [--repo-root <dir>] [--json]
      Check a runbook against the autodocs runbook contract.
  autodocs confluence <runbook.md> [--out <file.xhtml>] [--no-toc]
      Convert Markdown into Confluence storage format.
  autodocs bundle <docs-dir> [--repo-root <dir>] [--json]
      Export every diagram to .drawio, check the runbook, and write a
      Confluence import folder at <docs-dir>/confluence/.

Diagram engine commands (finalize, validate, render, guide, doctor, ...):
  autodocs finalize <type> <candidate.json> <output.html> [--repo-root <dir>] --quality showcase --json
  autodocs help-engine     Show the full diagram engine help.
`;

function parseOptions(args, flags) {
  const options = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) { options._.push(arg); continue; }
    const name = arg.slice(2);
    if (flags[name] === 'boolean') options[name] = true;
    else if (flags[name] === 'string') {
      if (args[i + 1] === undefined) fail(`--${name} needs a value.`);
      options[name] = args[++i];
    } else fail(`Unknown option ${arg}.`);
  }
  return options;
}

function fail(message, code = 2) {
  process.stderr.write(`autodocs: ${message}\n`);
  process.exit(code);
}

function readFile(file) {
  if (!file) fail('Missing input file.');
  if (!fs.existsSync(file)) fail(`File not found: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, content);
}

function titleFor(file) {
  return path.basename(file).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function drawioCommand(args) {
  const options = parseOptions(args, { out: 'string', title: 'string' });
  const input = options._[0];
  const out = options.out ?? input.replace(/\.html?$/i, '') + '.drawio';
  const html = readFile(input);
  const diagram = extractDiagram(html);
  writeFile(out, htmlToDrawio(html, { title: options.title ?? titleFor(input) }));
  process.stdout.write(`${JSON.stringify({ ok: true, output: path.resolve(out), nodes: diagram.nodes.length, edges: diagram.edges.length, frames: diagram.frames.length })}\n`);
}

function printRunbookReport(file, report, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify({ runbook: path.resolve(file), ...report }, null, 2)}\n`);
    return;
  }
  const { stats } = report;
  process.stdout.write(`${report.ok ? 'PASS' : 'FAIL'} ${file} — ${stats.requiredSectionsFound}/${stats.requiredSections} required sections, ${stats.citations} citations, ${stats.links} local links\n`);
  for (const item of report.errors) process.stdout.write(`  error   ${item.line ? `L${item.line} ` : ''}[${item.rule}] ${item.message}\n`);
  for (const item of report.warnings) process.stdout.write(`  warning ${item.line ? `L${item.line} ` : ''}[${item.rule}] ${item.message}\n`);
}

function runbookCommand(args) {
  const [sub, ...rest] = args;
  if (sub !== 'check') fail('Usage: autodocs runbook check <runbook.md> [--repo-root <dir>] [--json]');
  const options = parseOptions(rest, { 'repo-root': 'string', json: 'boolean' });
  const file = options._[0];
  const report = checkRunbook(readFile(file), { runbookPath: file, repoRoot: options['repo-root'] });
  printRunbookReport(file, report, options.json);
  process.exit(report.ok ? 0 : 1);
}

function confluenceCommand(args) {
  const options = parseOptions(args, { out: 'string', 'no-toc': 'boolean' });
  const input = options._[0];
  const out = options.out ?? input.replace(/\.md$/i, '') + '.confluence.xhtml';
  const page = markdownToConfluence(readFile(input), { toc: !options['no-toc'] });
  writeFile(out, page.xhtml);
  process.stdout.write(`${JSON.stringify({ ok: true, output: path.resolve(out), title: page.title, attachments: page.attachments })}\n`);
}

const IMPORT_GUIDE = (title, attachments) => `# Importing "${title}" into Confluence

Three steps: create the page, attach the files, place the diagrams. No API,
tokens or extra tools are needed; the API route at the end is optional.

| File | Use it for |
|---|---|
| \`page.html\` | Open in a browser and copy-paste into Confluence (easiest) |
| \`page.md\` | Paste as Markdown |
| \`page.xhtml\` | Confluence storage format, for a source editor app or the REST API |
| \`attachments/\` | Files to attach to the page: draw.io diagrams and interactive HTML diagrams |

## 1. Create the page

Create a new Confluence page titled **${title}**, then fill it with one of these:

**A. Copy and paste (recommended).** Open \`page.html\` in your browser, press
Cmd+A / Ctrl+A, copy, and paste into the empty page body. Headings, tables,
lists, links and code blocks keep their formatting; coloured callouts arrive as
plain text, which you can turn back into panels with \`/info\` or \`/warning\`.

**B. Paste Markdown.** Copy the contents of \`page.md\`. On Confluence Data
Center/Server, use *Insert → Markup → Markdown* and paste it. On Confluence
Cloud, paste it straight into the editor; it usually converts headings, lists,
tables and code as you paste. If it stays plain text, use option A.

**C. Storage format (exact panels, code macros and table of contents).** If
your site has a source editor app (for example *Confluence Source Editor*),
open it on the page and paste \`page.xhtml\`.

## 2. Attach the files

Edit the page and drag every file from \`attachments/\` onto it, or use
*••• → Attachments → Upload files*. Links in the page to these files start
working once they are attached.

## 3. Place the draw.io diagrams

Each "Diagram" panel names a \`.drawio\` file. Edit the page, click the panel,
choose *Insert → draw.io Diagram* (or type \`/draw.io\`), then *Import* (or
*File → Import from → Device* inside the draw.io editor) and select the file
from \`attachments/\`. Delete the panel afterwards. The diagram stays editable in
Confluence. This needs the *draw.io Diagrams for Confluence* app on your site;
without it, attach a PNG exported from the interactive \`.html\` diagram instead.

Readers can download the attached \`.html\` diagrams and open them in a browser
for focus, path tracing and image export.

## Optional: automate with the REST API

For scripted or CI publishing, create the page from \`page.xhtml\` and upload
the attachments:

\`\`\`bash
curl -u "$CONFLUENCE_USER:$CONFLUENCE_API_TOKEN" -H 'Content-Type: application/json' \\
  -X POST "$CONFLUENCE_BASE_URL/wiki/rest/api/content" \\
  -d "$(jq -n --arg t '${title.replace(/'/g, '')}' --arg s "$CONFLUENCE_SPACE" --rawfile b page.xhtml \\
    '{type:"page",title:$t,space:{key:$s},body:{storage:{value:$b,representation:"storage"}}}')"

for f in attachments/*; do
  curl -u "$CONFLUENCE_USER:$CONFLUENCE_API_TOKEN" -H 'X-Atlassian-Token: no-check' \\
    -X POST "$CONFLUENCE_BASE_URL/wiki/rest/api/content/$PAGE_ID/child/attachment" -F "file=@$f"
done
\`\`\`

## Files

${attachments.map((file) => `- \`attachments/${file}\``).join('\n') || '- (none)'}
`;

const DIAGRAMS_README = `# Diagrams

Each diagram has three files with the same name:

| File | What it is |
|---|---|
| \`<name>.json\` | The diagram's source. Edit this (or ask the agent to) and re-run \`/autodocs\` to regenerate the other two. Keep it in git. |
| \`<name>.html\` | Interactive diagram. Open in a browser: click components, trace paths, export PNG/SVG. |
| \`<name>.drawio\` | Editable draw.io file for Confluence or diagrams.net. |

Check results from generation are kept in \`../.checks/\`, which git ignores.
`;

// Engine check receipts are evidence for the agent, not documentation.
const CHECK_RECEIPT = /\.(delivery|finalize|finalize-summary|browser-check|visual-check)\.json$/;

function tidyChecks(docsDir) {
  const checksDir = path.join(docsDir, '.checks');
  let moved = 0;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'confluence') continue;
        if (/^(review|visual-check)/.test(entry.name)) {
          const target = path.join(checksDir, path.relative(docsDir, full));
          fs.rmSync(target, { recursive: true, force: true });
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.renameSync(full, target);
          moved += 1;
        } else visit(full);
      } else if (CHECK_RECEIPT.test(entry.name)) {
        const stem = entry.name.replace(CHECK_RECEIPT, '');
        const target = path.join(checksDir, stem, entry.name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(full, target);
        moved += 1;
      }
    }
  };
  visit(docsDir);
  writeFile(path.join(docsDir, '.gitignore'), '# Generation check results (autodocs)\n.checks/\n');
  return moved;
}

function bundleCommand(args) {
  const options = parseOptions(args, { 'repo-root': 'string', json: 'boolean' });
  const docsDir = path.resolve(options._[0] ?? 'docs/autodocs');
  if (!fs.existsSync(docsDir)) fail(`Docs folder not found: ${docsDir}`);
  const result = { docsDir, diagrams: [], runbook: null, confluence: null, warnings: [] };

  // 1. Every rendered diagram gets a fresh .drawio next to it.
  const htmlFiles = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'confluence' && !entry.name.startsWith('.') && !/^(review|visual-check)/.test(entry.name)) visit(full);
      } else if (/\.html$/i.test(entry.name)) htmlFiles.push(full);
    }
  };
  visit(docsDir);
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    try {
      extractDiagram(html);
    } catch {
      continue;
    }
    const out = file.replace(/\.html$/i, '.drawio');
    writeFile(out, htmlToDrawio(html, { title: titleFor(file) }));
    result.diagrams.push({ html: path.relative(docsDir, file), drawio: path.relative(docsDir, out) });
  }
  for (const dir of new Set(result.diagrams.map((diagram) => path.dirname(path.join(docsDir, diagram.html))))) {
    if (dir !== docsDir) writeFile(path.join(dir, 'README.md'), DIAGRAMS_README);
  }
  result.checksMoved = tidyChecks(docsDir);

  // 2. Check and convert the runbook.
  const runbookPath = path.join(docsDir, 'runbook.md');
  if (!fs.existsSync(runbookPath)) {
    result.warnings.push('runbook.md not found; only diagrams were exported.');
  } else {
    const markdown = fs.readFileSync(runbookPath, 'utf8');
    const report = checkRunbook(markdown, { runbookPath, repoRoot: options['repo-root'] });
    result.runbook = { path: 'runbook.md', ok: report.ok, errors: report.errors, warnings: report.warnings, stats: report.stats };

    // 3. Confluence folder: page body in two formats plus flat attachments.
    const confluenceDir = path.join(docsDir, 'confluence');
    const attachmentsDir = path.join(confluenceDir, 'attachments');
    fs.rmSync(confluenceDir, { recursive: true, force: true });
    fs.mkdirSync(attachmentsDir, { recursive: true });
    const page = markdownToConfluence(markdown);
    const flatNames = new Map();
    const attach = (relative) => {
      const source = path.resolve(docsDir, relative);
      if (!fs.existsSync(source)) return;
      const name = path.basename(source);
      if (flatNames.has(name) && flatNames.get(name) !== source) {
        result.warnings.push(`Two attachments are named ${name}; Confluence keeps one name per page.`);
        return;
      }
      flatNames.set(name, source);
      fs.copyFileSync(source, path.join(attachmentsDir, name));
    };
    page.attachments.forEach(attach);
    result.diagrams.forEach((diagram) => { attach(diagram.drawio); attach(diagram.html); });
    writeFile(path.join(confluenceDir, 'page.xhtml'), page.xhtml);
    writeFile(path.join(confluenceDir, 'page.html'), storageToHtml(page.xhtml, { title: page.title || 'Runbook' }));
    writeFile(path.join(confluenceDir, 'page.md'), markdown.replace(/^---\n[\s\S]*?\n---\n/, ''));
    const attachments = [...flatNames.keys()].sort();
    writeFile(path.join(confluenceDir, 'IMPORT.md'), IMPORT_GUIDE(page.title || 'Runbook', attachments));
    result.confluence = { dir: path.relative(docsDir, confluenceDir), title: page.title, attachments };
  }

  const ok = result.runbook ? result.runbook.ok : result.diagrams.length > 0;
  if (options.json) process.stdout.write(`${JSON.stringify({ ok, ...result }, null, 2)}\n`);
  else {
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'} bundle ${docsDir}\n`);
    for (const diagram of result.diagrams) process.stdout.write(`  drawio  ${diagram.drawio}\n`);
    if (result.runbook) printRunbookReport('runbook.md', result.runbook, false);
    if (result.confluence) process.stdout.write(`  confluence ${result.confluence.dir}/ (page.html, page.md, page.xhtml, IMPORT.md, ${result.confluence.attachments.length} attachments)\n`);
    if (result.checksMoved) process.stdout.write(`  tidied  ${result.checksMoved} check result(s) into .checks/\n`);
    for (const warning of result.warnings) process.stdout.write(`  warning ${warning}\n`);
  }
  process.exit(ok ? 0 : 1);
}

function delegate(args) {
  const run = spawnSync(process.execPath, [engine, ...args], { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case undefined: case 'help': case '-h': case '--help': process.stdout.write(USAGE); break;
  case 'help-engine': delegate(['help']); break;
  case 'drawio': drawioCommand(rest); break;
  case 'runbook': runbookCommand(rest); break;
  case 'confluence': confluenceCommand(rest); break;
  case 'bundle': bundleCommand(rest); break;
  default: delegate([command, ...rest]);
}
