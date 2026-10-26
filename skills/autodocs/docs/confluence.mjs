// Converts the Markdown subset used by autodocs runbooks into Confluence
// storage format (XHTML with ac:/ri: macros), the format accepted by the
// Confluence REST API and source-editor imports.
//
// Supported: front matter, headings, paragraphs, emphasis, inline code, links,
// images, nested lists, task items, GFM tables, fenced code, blockquotes,
// GitHub admonitions ([!NOTE] etc.), horizontal rules and <!-- toc -->.
// Local files become page attachments; *.drawio links become import panels.

import path from 'node:path';

const PANEL_FOR = { NOTE: 'info', TIP: 'tip', IMPORTANT: 'note', WARNING: 'warning', CAUTION: 'warning' };
const PANEL_TITLE = { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' };

// Language names understood by the Confluence code macro on Cloud and Data Center.
const CODE_LANGUAGES = {
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', bash: 'bash', dockerfile: 'bash', makefile: 'bash',
  js: 'js', javascript: 'js', mjs: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', json: 'js',
  py: 'py', python: 'py', java: 'java', kotlin: 'java', go: 'go', rb: 'ruby', ruby: 'ruby', php: 'php',
  cs: 'c#', csharp: 'c#', 'c#': 'c#', c: 'cpp', cpp: 'cpp', 'c++': 'cpp', sql: 'sql', css: 'css', scss: 'sass',
  html: 'xml', xml: 'xml', yaml: 'yml', yml: 'yml', toml: 'text', ini: 'text', powershell: 'powershell', ps1: 'powershell',
  diff: 'diff', scala: 'scala', groovy: 'groovy', perl: 'perl', text: 'text', txt: 'text', plaintext: 'text',
};

export function parseFrontMatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { data: {}, body: markdown, offset: 0 };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (field) data[field[1]] = field[2].replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return { data, body: markdown.slice(match[0].length), offset: match[0].split('\n').length - 1 };
}

export function markdownToConfluence(markdown, { toc = true } = {}) {
  const { data, body } = parseFrontMatter(markdown.replace(/\r\n/g, '\n'));
  const attachments = new Set();
  const context = { attachments };
  let blocks = body.split('\n');
  // The page title lives in Confluence's title field; drop a leading H1 that repeats it.
  const firstContent = blocks.findIndex((line) => line.trim() !== '');
  let title = data.title ?? '';
  if (firstContent >= 0 && /^#\s+/.test(blocks[firstContent])) {
    title ||= blocks[firstContent].replace(/^#\s+/, '').trim();
    blocks = blocks.slice(firstContent + 1);
  }
  let xhtml = convertBlocks(blocks, context);
  const hasTocMarker = xhtml.includes('ac:name="toc"');
  if (toc && !hasTocMarker) xhtml = `${tocMacro()}\n${xhtml}`;
  return { title, xhtml: `${xhtml}\n`, attachments: [...attachments], frontMatter: data };
}

function convertBlocks(lines, context) {
  const out = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') { index += 1; continue; }

    const fence = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (fence) {
      const closing = new RegExp(`^\\s*${fence[2][0]}{${fence[2].length},}\\s*$`);
      const code = [];
      index += 1;
      while (index < lines.length && !closing.test(lines[index])) {
        code.push(lines[index].startsWith(fence[1]) ? lines[index].slice(fence[1].length) : lines[index]);
        index += 1;
      }
      index += 1;
      out.push(codeMacro(code.join('\n'), fence[3]));
      continue;
    }

    if (/^\s*<!--\s*toc\s*-->\s*$/i.test(line)) { out.push(tocMacro()); index += 1; continue; }
    if (/^\s*<!--/.test(line)) {
      while (index < lines.length && !lines[index].includes('-->')) index += 1;
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      out.push(`<h${heading[1].length}>${inline(heading[2], context)}</h${heading[1].length}>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr />'); index += 1; continue; }

    if (isTableStart(lines, index)) {
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') rows.push(lines[index++]);
      out.push(table(rows, context));
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quoted.push(lines[index++].replace(/^\s*>\s?/, ''));
      out.push(blockquote(quoted, context));
      continue;
    }

    if (listMarker(line)) {
      const [html, next] = list(lines, index, context);
      out.push(html);
      index = next;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() !== '' && !startsBlock(lines, index)) paragraph.push(lines[index++]);
    if (!paragraph.length) paragraph.push(lines[index++]);
    out.push(paragraphBlock(paragraph, context));
  }
  return out.join('\n');
}

function startsBlock(lines, index) {
  const line = lines[index];
  return /^(\s*)(`{3,}|~{3,})/.test(line) || /^#{1,6}\s/.test(line) || /^\s*>/.test(line)
    || Boolean(listMarker(line)) || isTableStart(lines, index) || /^\s*<!--/.test(line)
    || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line);
}

function isTableStart(lines, index) {
  return lines[index]?.includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[index + 1] ?? '');
}

function splitRow(row) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (char === '\\' && trimmed[i + 1] === '|') { current += '|'; i += 1; continue; }
    if (char === '`') inCode = !inCode;
    if (char === '|' && !inCode) { cells.push(current.trim()); current = ''; continue; }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function table(rows, context) {
  const header = splitRow(rows[0]);
  const body = rows.slice(2).map(splitRow);
  const cell = (tag, value) => `<${tag}>${inline(value, context)}</${tag}>`;
  return [
    '<table data-layout="default"><tbody>',
    `<tr>${header.map((value) => cell('th', value)).join('')}</tr>`,
    ...body.map((cells) => `<tr>${header.map((_, i) => cell('td', cells[i] ?? '')).join('')}</tr>`),
    '</tbody></table>',
  ].join('\n');
}

function blockquote(lines, context) {
  const marker = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(lines[0] ?? '');
  const bold = /^\s*\*\*(Note|Tip|Important|Warning|Caution):?\*\*:?\s*(.*)$/i.exec(lines[0] ?? '');
  const kind = (marker?.[1] ?? bold?.[1])?.toUpperCase();
  if (!kind) return `<blockquote>${convertBlocks(lines, context)}</blockquote>`;
  const rest = [(marker?.[2] ?? bold?.[2] ?? '').trim(), ...lines.slice(1)].filter((line, i) => i > 0 || line);
  return panelMacro(PANEL_FOR[kind], PANEL_TITLE[kind], convertBlocks(rest, context));
}

function listMarker(line) {
  const match = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
  if (!match) return null;
  return { indent: match[1].length, ordered: /\d/.test(match[2]), content: match[3], contentIndent: match[1].length + match[2].length + 1 };
}

function list(lines, start, context) {
  const first = listMarker(lines[start]);
  const items = [];
  let index = start;
  while (index < lines.length) {
    const marker = listMarker(lines[index]);
    if (!marker || marker.indent !== first.indent || marker.ordered !== first.ordered) break;
    const body = [marker.content];
    index += 1;
    while (index < lines.length) {
      const line = lines[index];
      if (line.trim() === '') {
        const nextLine = lines.slice(index + 1).find((candidate) => candidate.trim() !== '');
        if (nextLine && leadingSpaces(nextLine) >= marker.contentIndent) { body.push(''); index += 1; continue; }
        break;
      }
      const nested = listMarker(line);
      if (nested && nested.indent <= first.indent) break;
      if (!nested && leadingSpaces(line) < marker.contentIndent && body[body.length - 1] === '') break;
      body.push(leadingSpaces(line) >= marker.contentIndent ? line.slice(marker.contentIndent) : line.trimStart());
      index += 1;
    }
    items.push(body);
  }
  const tag = first.ordered ? 'ol' : 'ul';
  const html = items.map((body) => {
    const task = /^\[( |x|X)\]\s+(.*)$/.exec(body[0]);
    if (task) body[0] = `${task[1] === ' ' ? '☐' : '☑'} ${task[2]}`;
    let content = convertBlocks(body, context);
    const single = /^<p>([\s\S]*?)<\/p>(\n|$)/.exec(content);
    if (single && !content.slice(single[0].length).startsWith('<p>')) content = single[1] + (content.slice(single[0].length) ? `\n${content.slice(single[0].length)}` : '');
    return `<li>${content}</li>`;
  });
  return [`<${tag}>\n${html.join('\n')}\n</${tag}>`, index];
}

function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}

function paragraphBlock(lines, context) {
  const text = lines.join('\n').trim();
  const drawio = /^!?\[([^\]]*)\]\(([^)\s]+\.drawio)\)$/.exec(text);
  if (drawio) return drawioPanel(drawio[1], drawio[2], context);
  const joined = lines.map((line, i) => {
    const hard = /( {2,}|\\)$/.test(line) && i < lines.length - 1;
    return inline(line.replace(/( {2,}|\\)$/, '').trim(), context) + (hard ? '<br />' : '');
  }).join(' ');
  return `<p>${joined}</p>`;
}

function inline(text, context) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let value = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) => keep(`<code>${escapeXml(code.trim())}</code>`));
  value = value.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, src) => keep(image(alt, src, context)));
  value = value.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, href) => keep(link(label, href, context)));
  value = value.replace(/<(https?:\/\/[^>\s]+)>/g, (_, href) => keep(`<a href="${escapeXml(href)}">${escapeXml(href)}</a>`));
  value = escapeXml(value);
  value = value
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![_\w])/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return value.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
}

function isRemote(href) {
  return /^(https?:|mailto:)/i.test(href);
}

function image(alt, src, context) {
  if (isRemote(src)) return `<ac:image ac:alt="${escapeXml(alt)}"><ri:url ri:value="${escapeXml(src)}" /></ac:image>`;
  if (/\.drawio$/i.test(src)) return link(alt || path.basename(src), src, context);
  const name = path.basename(src);
  context.attachments.add(src);
  return `<ac:image ac:alt="${escapeXml(alt)}"><ri:attachment ri:filename="${escapeXml(name)}" /></ac:image>`;
}

function link(label, href, context) {
  const text = inline(label, context);
  if (isRemote(href) || href.startsWith('#')) return `<a href="${escapeXml(href)}">${text}</a>`;
  const [file] = href.split('#');
  if (/\.md$/i.test(file)) return text;
  context.attachments.add(file);
  return `<ac:link><ri:attachment ri:filename="${escapeXml(path.basename(file))}" /><ac:plain-text-link-body>${cdata(label.replace(/`/g, ''))}</ac:plain-text-link-body></ac:link>`;
}

function drawioPanel(label, src, context) {
  context.attachments.add(src);
  const name = path.basename(src);
  const body = [
    `<p><strong>${escapeXml(label || name)}</strong> — editable draw.io diagram attached to this page as `
      + `<ac:link><ri:attachment ri:filename="${escapeXml(name)}" /><ac:plain-text-link-body>${cdata(name)}</ac:plain-text-link-body></ac:link>.</p>`,
    '<p>To show it here: edit the page, replace this panel with <em>Insert → draw.io Diagram</em>, then choose '
      + `<em>Import</em> (or <em>File → Import from → Device</em>) and select <code>${escapeXml(name)}</code>.</p>`,
  ].join('\n');
  return panelMacro('info', `Diagram: ${label || name}`, body);
}

function panelMacro(name, title, body) {
  return `<ac:structured-macro ac:name="${name}" ac:schema-version="1"><ac:parameter ac:name="title">${escapeXml(title)}</ac:parameter>`
    + `<ac:rich-text-body>${body}</ac:rich-text-body></ac:structured-macro>`;
}

function codeMacro(code, language) {
  const lang = CODE_LANGUAGES[String(language || '').toLowerCase()] ?? 'text';
  return `<ac:structured-macro ac:name="code" ac:schema-version="1"><ac:parameter ac:name="language">${lang}</ac:parameter>`
    + `<ac:parameter ac:name="linenumbers">false</ac:parameter><ac:plain-text-body>${cdata(code)}</ac:plain-text-body></ac:structured-macro>`;
}

function tocMacro() {
  return '<ac:structured-macro ac:name="toc" ac:schema-version="1"><ac:parameter ac:name="maxLevel">3</ac:parameter></ac:structured-macro>';
}

function cdata(text) {
  return `<![CDATA[${String(text).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

export function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
