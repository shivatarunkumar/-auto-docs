// Minimal XML tree reader for the renderer's own SVG output.
// It is not a general HTML parser: it locates the diagram <svg> element inside
// a rendered page and reads that well-formed SVG subtree.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function parseAttributes(source) {
  const attrs = {};
  const pattern = /([^\s=/]+)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(source))) {
    attrs[match[1]] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? '');
  }
  return attrs;
}

// Parses markup starting at `start` (which must point at an opening tag) and
// returns the element tree for that tag and its descendants.
export function parseElementAt(markup, start) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let index = start;
  while (index < markup.length) {
    if (markup.startsWith('<!--', index)) {
      const end = markup.indexOf('-->', index + 4);
      index = end < 0 ? markup.length : end + 3;
      continue;
    }
    if (markup.startsWith('<![CDATA[', index)) {
      const end = markup.indexOf(']]>', index + 9);
      const text = markup.slice(index + 9, end < 0 ? markup.length : end);
      stack[stack.length - 1].children.push({ name: '#text', text });
      index = end < 0 ? markup.length : end + 3;
      continue;
    }
    if (markup[index] === '<') {
      const end = findTagEnd(markup, index);
      const raw = markup.slice(index + 1, end);
      index = end + 1;
      if (raw[0] === '/') {
        const name = raw.slice(1).trim();
        while (stack.length > 1) {
          const closed = stack.pop();
          if (closed.name === name) break;
        }
        if (stack.length === 1) return root.children[0] ?? null;
        continue;
      }
      if (raw[0] === '!' || raw[0] === '?') continue;
      const selfClosing = raw.endsWith('/');
      const body = selfClosing ? raw.slice(0, -1) : raw;
      const nameMatch = /^[^\s/>]+/.exec(body);
      if (!nameMatch) continue;
      const element = { name: nameMatch[0], attrs: parseAttributes(body.slice(nameMatch[0].length)), children: [] };
      stack[stack.length - 1].children.push(element);
      if (!selfClosing) stack.push(element);
      else if (stack.length === 1) return element;
      continue;
    }
    const next = markup.indexOf('<', index);
    const text = markup.slice(index, next < 0 ? markup.length : next);
    if (text.trim()) stack[stack.length - 1].children.push({ name: '#text', text: decodeEntities(text) });
    index = next < 0 ? markup.length : next;
  }
  return root.children[0] ?? null;
}

function findTagEnd(markup, start) {
  let quote = null;
  for (let index = start + 1; index < markup.length; index += 1) {
    const char = markup[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return markup.length - 1;
}

// The diagram SVG is the first <svg> that contains a focusable node.
export function findDiagramSvg(html) {
  const pattern = /<svg[\s>]/g;
  let match;
  while ((match = pattern.exec(html))) {
    const element = parseElementAt(html, match.index);
    if (element && findFirst(element, (node) => node.attrs?.['data-node-id'] !== undefined)) return element;
  }
  return null;
}

export function walk(element, visit, parent = null) {
  if (!element || element.name === '#text') return;
  if (visit(element, parent) === false) return;
  for (const child of element.children) walk(child, visit, element);
}

export function findFirst(element, predicate) {
  let found = null;
  walk(element, (node) => {
    if (found) return false;
    if (predicate(node)) {
      found = node;
      return false;
    }
    return true;
  });
  return found;
}

export function findAll(element, predicate) {
  const found = [];
  walk(element, (node) => {
    if (predicate(node)) found.push(node);
  });
  return found;
}

export function textContent(element) {
  if (!element) return '';
  if (element.name === '#text') return element.text;
  return element.children.map(textContent).join('');
}
