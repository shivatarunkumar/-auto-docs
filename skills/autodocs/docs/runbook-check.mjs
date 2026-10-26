// Checks authored documentation against the autodocs contracts
// (references/runbook-authoring.md, references/readme-authoring.md): front
// matter, required sections, no placeholder text, labelled code blocks,
// existing local links, and source citations that resolve to real files and
// line ranges at the repository root.

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

export const README_SECTIONS = [
  { id: 'overview', required: true, title: 'Overview', match: /overview|about|what (it|this) (is|does)|introduction/i },
  { id: 'quickstart', required: true, title: 'Quick start', match: /quick ?start|getting started|install|setup|set up/i },
  { id: 'configuration', required: true, title: 'Configuration', match: /configur|environment variables|settings/i },
  { id: 'usage', required: true, title: 'Usage', match: /usage|how to use|examples?/i },
  { id: 'architecture', required: true, title: 'Architecture', match: /architecture|how it works|design/i },
  { id: 'troubleshooting', required: false, title: 'Troubleshooting', match: /troubleshoot|known issues|faq/i },
];

const REQUIRED_FRONT_MATTER = ['title', 'repository', 'revision', 'generated'];
const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX)\b|lorem ipsum|<insert[^>]*>|\{\{[^}]*\}\}|\[placeholder\]/i;
const CITATION = /`([\w@.~/-]+\.[\w-]+|[\w@.~/-]*(?:Dockerfile|Makefile|Procfile))(?::(\d+)(?:-(\d+))?)?`/g;

export const README_START = '<!-- autodocs:start -->';
export const README_END = '<!-- autodocs:end -->';

// Splits Markdown into prose lines (outside fenced code) and `##` sections.
function scan(lines, offset, add, warnings) {
  const sections = [];
  const prose = [];
  const citations = [];
  let inFence = false;
  let fenceMarker = '';
  let current = null;
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
      prose.push({ line, lineNumber });
      return;
    }
    prose.push({ line, lineNumber });
    if (current && line.trim() && !/^#{3,6}\s/.test(line)) current.content += 1;
    for (const match of line.matchAll(CITATION)) {
      if (!match[2]) continue;
      citations.push({ file: match[1], start: Number(match[2]), end: Number(match[3] ?? match[2]), line: lineNumber });
      if (current) current.citations += 1;
    }
  });
  return { sections, prose, citations };
}

function checkSections(specs, sections, add, errors, warnings) {
  const found = new Map();
  for (const spec of specs) {
    const section = sections.find((candidate) => spec.match.test(candidate.heading));
    if (section) found.set(spec.id, section);
    else if (spec.required) add(errors, 'missing-section', `Required section "## ${spec.title}" is missing.`);
    else add(warnings, 'missing-section', `Optional section "## ${spec.title}" is missing; add it or state why it does not apply.`);
  }
  for (const section of sections) {
    if (section.content === 0) add(errors, 'empty-section', `Section "${section.heading}" has no content.`, section.line);
  }
  return found;
}

function checkPlaceholders(prose, add, errors) {
  for (const { line, lineNumber } of prose) {
    if (PLACEHOLDER.test(line.replace(/`[^`]*`/g, ''))) add(errors, 'placeholder', `Placeholder text: "${line.trim().slice(0, 80)}".`, lineNumber);
  }
}

function checkCitations(citations, repoRoot, add, errors, warnings) {
  if (!repoRoot) {
    if (citations.length) add(warnings, 'citation', 'Pass --repo-root to verify that cited files and line ranges exist.');
    return;
  }
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
}

// Local links (diagrams, images, attachments) must exist relative to the document.
function collectLinks(prose) {
  const links = [];
  for (const { line, lineNumber } of prose) {
    for (const match of line.replace(/`[^`]*`/g, '').matchAll(/!?\[[^\]]*\]\(([^)\s#]+)(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g)) {
      if (!/^(https?:|mailto:)/i.test(match[1])) links.push({ href: match[1], line: lineNumber });
    }
  }
  return links;
}

function checkLinks(links, documentPath, add, errors) {
  if (!documentPath) return;
  const base = path.dirname(path.resolve(documentPath));
  for (const link of links) {
    if (!fs.existsSync(path.resolve(base, decodeURI(link.href)))) add(errors, 'broken-link', `Linked file ${link.href} does not exist.`, link.line);
  }
}

export function checkRunbook(markdown, { runbookPath = null, repoRoot = null, requireDiagram = true } = {}) {
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

  const { sections, prose, citations } = scan(body.split('\n'), offset, add, warnings);
  const found = checkSections(RUNBOOK_SECTIONS, sections, add, errors, warnings);
  checkPlaceholders(prose, add, errors);

  const implementation = found.get('implementation');
  if (implementation && implementation.citations === 0) {
    add(errors, 'implementation-citations', 'The "How it works" section must cite source as `path/file.ext:line` or `path/file.ext:start-end`.', implementation.line);
  }
  checkCitations(citations, repoRoot, add, errors, warnings);

  const links = collectLinks(prose);
  checkLinks(links, runbookPath, add, errors);
  if (requireDiagram && !links.some((link) => /\.drawio$/i.test(link.href))) {
    add(errors, 'drawio-link', 'The runbook must link at least one .drawio diagram (the architecture diagram). Use --text-only for a runbook without diagrams.');
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

// Checks only the autodocs-managed block of a README; the rest is the owner's.
export function checkReadme(markdown, { readmePath = null, repoRoot = null } = {}) {
  const errors = [];
  const warnings = [];
  const add = (list, rule, message, line = null) => list.push({ rule, message, ...(line ? { line } : {}) });
  const text = markdown.replace(/\r\n/g, '\n');
  const start = text.indexOf(README_START);
  const end = text.indexOf(README_END);
  if (start < 0 || end < start) {
    add(errors, 'managed-block', `README has no ${README_START} … ${README_END} block.`);
    return { ok: false, errors, warnings, stats: { sections: 0, requiredSectionsFound: 0, requiredSections: README_SECTIONS.filter((s) => s.required).length, citations: 0, links: 0 } };
  }
  const offset = text.slice(0, start).split('\n').length;
  const block = text.slice(start + README_START.length, end);
  const { sections, prose, citations } = scan(block.split('\n'), offset - 1, add, warnings);
  const found = checkSections(README_SECTIONS, sections, add, errors, warnings);
  checkPlaceholders(prose, add, errors);
  checkCitations(citations, repoRoot, add, errors, warnings);
  const links = collectLinks(prose);
  checkLinks(links, readmePath, add, errors);
  if (!links.some((link) => /\.(png|svg)$/i.test(link.href))) {
    add(warnings, 'diagram-image', 'The README shows no diagram image; embed the architecture PNG so GitHub renders it.');
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      sections: sections.length,
      requiredSectionsFound: README_SECTIONS.filter((spec) => spec.required && found.has(spec.id)).length,
      requiredSections: README_SECTIONS.filter((spec) => spec.required).length,
      citations: citations.length,
      links: links.length,
    },
  };
}

// Inserts or replaces the managed block. Everything outside the markers is
// kept byte for byte. A README without markers gets the block after its first
// heading paragraph (or at the end); a missing README is created.
export function applyReadmeBlock(existing, blockMarkdown, { title = null } = {}) {
  const block = `${README_START}\n${blockMarkdown.replace(/\r\n/g, '\n').trim()}\n${README_END}`;
  if (existing == null || existing.trim() === '') return `# ${title ?? 'Project'}\n\n${block}\n`;
  const text = existing;
  const start = text.indexOf(README_START);
  const end = text.indexOf(README_END);
  if (start >= 0 && end > start) return text.slice(0, start) + block + text.slice(end + README_END.length);
  const lines = text.split('\n');
  const heading = lines.findIndex((line) => /^#\s+/.test(line));
  if (heading < 0) return `${text.replace(/\n*$/, '\n\n')}${block}\n`;
  // After the title and the paragraph that follows it, if any.
  let insertAt = heading + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt += 1;
  if (insertAt < lines.length && !/^#{1,6}\s/.test(lines[insertAt])) {
    while (insertAt < lines.length && lines[insertAt].trim() !== '') insertAt += 1;
  }
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const gapBefore = before[before.length - 1]?.trim() === '' ? [] : [''];
  const gapAfter = after.length && after[0].trim() !== '' ? [''] : [];
  return [...before, ...gapBefore, block, ...gapAfter, ...after].join('\n');
}
