#!/usr/bin/env node
// autodocs CLI. Documentation commands live here; every other command
// (finalize, validate, render, guide, doctor, ...) is passed to the diagram
// engine in bin/engine.mjs unchanged.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDiagram, htmlToDrawio } from '../drawio/export-drawio.mjs';
import { markdownToConfluence } from '../docs/confluence.mjs';
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

This folder is self-contained. Create one Confluence page for the runbook, then
attach the files under \`attachments/\` to that page.

## 1. Create the page

Pick one of these:

- **Storage format (keeps code blocks, panels and the table of contents).**
  Use the REST API or a source editor app with \`page.xhtml\`:

  \`\`\`bash
  curl -u "$CONFLUENCE_USER:$CONFLUENCE_API_TOKEN" -H 'Content-Type: application/json' \\
    -X POST "$CONFLUENCE_BASE_URL/wiki/rest/api/content" \\
    -d "$(jq -n --arg t '${title.replace(/'/g, '')}' --arg s "$CONFLUENCE_SPACE" --rawfile b page.xhtml \\
      '{type:"page",title:$t,space:{key:$s},body:{storage:{value:$b,representation:"storage"}}}')"
  \`\`\`

- **Markdown.** In the Confluence editor, choose *Insert → Markup → Markdown* and
  paste \`page.md\`.

## 2. Attach the files

Upload every file in \`attachments/\` to the page (*••• → Attachments → Upload*),
or with the REST API:

\`\`\`bash
for f in attachments/*; do
  curl -u "$CONFLUENCE_USER:$CONFLUENCE_API_TOKEN" -H 'X-Atlassian-Token: no-check' \\
    -X POST "$CONFLUENCE_BASE_URL/wiki/rest/api/content/$PAGE_ID/child/attachment" -F "file=@$f"
done
\`\`\`

## 3. Place the draw.io diagrams

Each blue "Diagram" panel on the page names a \`.drawio\` file. Edit the page,
put the cursor on the panel, choose *Insert → draw.io Diagram → Import* (or
*File → Import from → Device* inside the draw.io editor), and select the file
from \`attachments/\`. The diagram stays editable in Confluence. This needs the
"draw.io Diagrams for Confluence" app on your site.

Interactive \`.html\` diagrams are attached too; viewers download and open them
in a browser for focus, path tracing and image export.

## Files

${attachments.map((file) => `- \`attachments/${file}\``).join('\n') || '- (none)'}
`;

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
    if (result.confluence) process.stdout.write(`  confluence ${result.confluence.dir}/ (page.xhtml, page.md, IMPORT.md, ${result.confluence.attachments.length} attachments)\n`);
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
