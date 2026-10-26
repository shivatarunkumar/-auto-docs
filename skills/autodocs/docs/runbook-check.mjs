// Checks an authored runbook against the autodocs runbook contract
// (references/runbook-authoring.md): front matter, required sections, no
// placeholder text, labelled code blocks, existing local links, and source
// citations that resolve to real files and line ranges at the repository root.

import fs from 'node:fs';
import path from 'node:path';
import { parseFrontMatter } from './confluence.mjs';

export const RUNBOOK_SECTIONS = [
  { id: 'overview', required: true, title: 'Overview', match: /overview|purpose|introduction|what (it|this) (is|does)/i },
  { id: 'architecture', required: true, title: 'Architecture', match: /architecture|system design/i },
  { id: 'prerequisites', required: true, title: 'Prerequisites', match: /prerequisite|requirements/i },
  { id: 'setup', required: true, title: 'Installation and setup', match: /install|setup|set up|getting started/i },
  { id: 'configuration', required: true, title: 'Configuration', match: /configur|environment variables|settings/i },
  { id: 'usage', required: true, title: 'Usage', match: /usage|how to use|using /i },
  { id: 'implementation', required: true, title: 'How it works', match: /how it works|implementation|internals|code walkthrough/i },
  { id: 'operations', required: false, title: 'Deployment and operations', match: /deploy|operat|monitor|release/i },
  { id: 'troubleshooting', required: true, title: 'Troubleshooting', match: /troubleshoot|known issues|faq/i },
  { id: 'references', required: true, title: 'Source map', match: /source map|code map|references/i },
];

const REQUIRED_FRONT_MATTER = ['title', 'repository', 'revision', 'generated'];
const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX)\b|lorem ipsum|<insert[^>]*>|\{\{[^}]*\}\}|\[placeholder\]/i;
const CITATION = /`([\w@.~/-]+\.[\w-]+|[\w@.~/-]*(?:Dockerfile|Makefile|Procfile))(?::(\d+)(?:-(\d+))?)?`/g;

export function checkRunbook(markdown, { runbookPath = null, repoRoot = null } = {}) {
  const errors = [];
  const warnings = [];
  const add = (list, rule, message, line = null) => list.push({ rule, message, ...(line ? { line } : {}) });
  const { data, body, offset } = parseFrontMatter(markdown.replace(/\r\n/g, '\n'));

  for (const key of REQUIRED_FRONT_MATTER) {
    if (!data[key]) add(errors, 'front-matter', `Front matter is missing "${key}".`, 1);
  }
  if (data.revision && !/^[0-9a-f]{7,40}$/i.test(data.revision)) {
    add(warnings, 'front-matter', `revision "${data.revision}" is not a git commit hash.`, 1);
  }

  const lines = body.split('\n');
  const sections = [];
  let inFence = false;
  let fenceMarker = '';
  let current = null;
  const prose = [];
  lines.forEach((line, i) => {
    const lineNumber = i + 1 + offset;
    const fence = /^\s*(`{3,}|~{3,})\s*(\S*)/.exec(line);
    if (fence && (!inFence || fence[1][0] === fenceMarker[0])) {
      if (!inFence && !fence[2]) add(warnings, 'code-language', 'Code block has no language; Confluence shows it as plain text.', lineNumber);
      inFence = !inFence;
      fenceMarker = fence[1];
      if (current) current.content += 1;
      return;
    }
    if (inFence) { if (current) current.content += 1; return; }
    const h2 = /^##\s+(.*?)\s*#*\s*$/.exec(line);
    if (h2) {
      current = { heading: h2[1], line: lineNumber, content: 0, citations: 0 };
      sections.push(current);
      return;
    }
    prose.push({ line, lineNumber });
    if (current && line.trim() && !/^#{3,6}\s/.test(line)) current.content += 1;
  });

  const found = new Map();
  for (const spec of RUNBOOK_SECTIONS) {
    const section = sections.find((candidate) => spec.match.test(candidate.heading));
    if (section) found.set(spec.id, section);
    else if (spec.required) add(errors, 'missing-section', `Required section "## ${spec.title}" is missing.`);
    else add(warnings, 'missing-section', `Optional section "## ${spec.title}" is missing; add it or state why it does not apply.`);
  }
  for (const section of sections) {
    if (section.content === 0) add(errors, 'empty-section', `Section "${section.heading}" has no content.`, section.line);
  }

  for (const { line, lineNumber } of prose) {
    const withoutCode = line.replace(/`[^`]*`/g, '');
    if (PLACEHOLDER.test(withoutCode)) add(errors, 'placeholder', `Placeholder text: "${line.trim().slice(0, 80)}".`, lineNumber);
  }

  // Source citations: `path/to/file.ext:12` or `path/to/file.ext:12-40`.
  const citations = [];
  let section = null;
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fenced = !fenced;
    if (fenced) return;
    const h2 = /^##\s+(.*?)\s*#*\s*$/.exec(line);
    if (h2) section = sections.find((candidate) => candidate.line === i + 1 + offset) ?? null;
    for (const match of line.matchAll(CITATION)) {
      if (!match[2]) continue;
      citations.push({ file: match[1], start: Number(match[2]), end: Number(match[3] ?? match[2]), line: i + 1 + offset });
      if (section) section.citations += 1;
    }
  });
  const implementation = found.get('implementation');
  if (implementation && implementation.citations === 0) {
    add(errors, 'implementation-citations', 'The "How it works" section must cite source as `path/file.ext:line` or `path/file.ext:start-end`.', implementation.line);
  }
  if (repoRoot) {
    const root = path.resolve(repoRoot);
    for (const citation of citations) {
      const file = path.resolve(root, citation.file);
      if (!file.startsWith(root + path.sep)) {
        add(errors, 'citation', `Citation ${citation.file} points outside the repository.`, citation.line);
        continue;
      }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        add(errors, 'citation', `Cited file ${citation.file} does not exist under ${root}.`, citation.line);
        continue;
      }
      const content = fs.readFileSync(file, 'utf8');
      const lineCount = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
      if (citation.start < 1 || citation.end < citation.start || citation.end > lineCount) {
        add(errors, 'citation', `Citation ${citation.file}:${citation.start}-${citation.end} is outside the file (1-${lineCount}).`, citation.line);
      }
    }
  } else if (citations.length) {
    add(warnings, 'citation', 'Pass --repo-root to verify that cited files and line ranges exist.');
  }

  // Local links (diagrams, attachments) must exist relative to the runbook.
  const links = [];
  for (const { line, lineNumber } of prose) {
    for (const match of line.replace(/`[^`]*`/g, '').matchAll(/!?\[[^\]]*\]\(([^)\s#]+)(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g)) {
      if (!/^(https?:|mailto:)/i.test(match[1])) links.push({ href: match[1], line: lineNumber });
    }
  }
  if (runbookPath) {
    const base = path.dirname(path.resolve(runbookPath));
    for (const link of links) {
      if (!fs.existsSync(path.resolve(base, decodeURI(link.href)))) add(errors, 'broken-link', `Linked file ${link.href} does not exist.`, link.line);
    }
  }
  if (!links.some((link) => /\.drawio$/i.test(link.href))) {
    add(errors, 'drawio-link', 'The runbook must link at least one .drawio diagram (the architecture diagram).');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      sections: sections.length,
      requiredSectionsFound: RUNBOOK_SECTIONS.filter((spec) => spec.required && found.has(spec.id)).length,
      requiredSections: RUNBOOK_SECTIONS.filter((spec) => spec.required).length,
      citations: citations.length,
      links: links.length,
    },
  };
}
