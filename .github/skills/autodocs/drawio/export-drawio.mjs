// Converts a rendered diagram page into an editable draw.io (.drawio) file.
//
// The renderers already resolve layout, so this reads the final geometry from
// the page's diagram SVG instead of re-laying out the JSON candidate:
//   - nodes:  <g data-node-id> and their first semantic <rect class="c-*">
//   - frames: <rect data-graph-role="structural-frame"> (regions, groups, lanes)
//   - edges:  elements carrying data-edge-from / data-edge-to and their points
// Every diagram type shares these markers, so one exporter serves them all.

import { createHash } from 'node:crypto';
import { findAll, findDiagramSvg, findFirst, textContent } from './svg-tree.mjs';

const NODE_STYLES = {
  frontend: { fill: '#E0F2FE', stroke: '#0284C7' },
  backend: { fill: '#DCFCE7', stroke: '#16A34A' },
  database: { fill: '#FEF3C7', stroke: '#D97706', shape: 'cylinder' },
  storage: { fill: '#FEF3C7', stroke: '#D97706', shape: 'cylinder' },
  cloud: { fill: '#EDE9FE', stroke: '#7C3AED' },
  security: { fill: '#FEE2E2', stroke: '#DC2626' },
  messagebus: { fill: '#FFEDD5', stroke: '#EA580C' },
  queue: { fill: '#FFEDD5', stroke: '#EA580C' },
  external: { fill: '#F1F5F9', stroke: '#64748B' },
  start: { fill: '#E0F2FE', stroke: '#0284C7' },
  success: { fill: '#DCFCE7', stroke: '#16A34A' },
  failure: { fill: '#FEE2E2', stroke: '#DC2626' },
  waiting: { fill: '#FEF9C3', stroke: '#CA8A04' },
  decision: { fill: '#FEF9C3', stroke: '#CA8A04', shape: 'rhombus' },
};
const DEFAULT_NODE_STYLE = { fill: '#F8FAFC', stroke: '#475569' };

const FRAME_STYLES = {
  region: 'rounded=1;arcSize=4;dashed=1;fillColor=none;strokeColor=#7C3AED;',
  'security-group': 'rounded=1;arcSize=4;dashed=1;dashPattern=4 4;fillColor=none;strokeColor=#DC2626;',
  lane: 'rounded=1;arcSize=3;fillColor=#F8FAFC;strokeColor=#CBD5E1;',
  'exception-lane': 'rounded=1;arcSize=3;dashed=1;fillColor=#FEF2F2;strokeColor=#FCA5A5;',
  segment: 'rounded=1;arcSize=3;fillColor=#F8FAFC;strokeColor=#E2E8F0;',
};
const DEFAULT_FRAME_STYLE = 'rounded=1;arcSize=4;dashed=1;fillColor=none;strokeColor=#94A3B8;';

const EDGE_STYLES = {
  'a-emphasis': 'strokeColor=#0F172A;strokeWidth=2;',
  'a-security': 'strokeColor=#DC2626;strokeWidth=1.5;',
  'a-dashed': 'strokeColor=#475569;dashed=1;',
  'a-default': 'strokeColor=#475569;',
};

const ENDPOINT_TOLERANCE = 4;

export function htmlToDrawio(html, { title = 'Diagram' } = {}) {
  const diagram = extractDiagram(html);
  return diagramToDrawio(diagram, { title });
}

export function extractDiagram(html) {
  const svg = findDiagramSvg(html);
  if (!svg) throw new Error('No rendered diagram SVG (an <svg> containing data-node-id elements) was found.');
  const [minX = 0, minY = 0, width = 1200, height = 800] = String(svg.attrs.viewBox ?? '')
    .trim().split(/[\s,]+/).map(Number);
  const origin = { x: minX, y: minY };

  const frames = [];
  const frameLabels = new Map();
  for (const group of findAll(svg, (el) => el.attrs['data-graph-role'] === 'structural-frame-label')) {
    frameLabels.set(group.attrs['data-composition-frame-id'], textContent(group).trim());
  }
  // Sequence segments label their frames from a separate group keyed by segment id.
  for (const group of findAll(svg, (el) => el.attrs['data-graph-role'] === 'segment-label')) {
    if (!frameLabels.has(group.attrs['data-segment-id'])) frameLabels.set(group.attrs['data-segment-id'], textContent(group).trim());
  }
  findAll(svg, (el) => el.children?.some((child) => child.attrs?.['data-graph-role'] === 'structural-frame'))
    .forEach((parent) => {
      parent.children.forEach((child, index) => {
        if (child.attrs?.['data-graph-role'] !== 'structural-frame') return;
        const id = child.attrs['data-composition-frame-id'] ?? String(frames.length);
        const sibling = parent.children[index + 1];
        const siblingLabel = sibling?.name === 'text' ? textContent(sibling).trim() : '';
        frames.push({
          id,
          kind: child.attrs['data-composition-frame-kind'] ?? 'frame',
          label: child.attrs['data-composition-frame-label'] || frameLabels.get(id) || siblingLabel,
          box: rectBox(child, origin),
        });
      });
    });

  const nodes = new Map();
  for (const group of findAll(svg, (el) => el.attrs['data-node-id'] !== undefined && el.name === 'g')) {
    const id = group.attrs['data-node-id'];
    if (nodes.has(id)) continue;
    const shape = findFirst(group, (el) => el.name === 'rect' && /\bc-(?!mask\b)/.test(el.attrs.class ?? ''))
      ?? findFirst(group, (el) => el.name === 'rect');
    if (!shape) continue;
    const rows = findAll(group, (el) => el.attrs['data-er-row'] !== undefined || el.attrs['data-class-member'] !== undefined)
      .map((row) => findAll(row, (el) => el.name === 'text').map((text) => textContent(text).trim()).filter(Boolean).join(' '))
      .filter(Boolean);
    nodes.set(id, {
      id,
      label: group.attrs['data-node-label'] ?? id,
      sublabel: group.attrs['data-node-sublabel'] ?? '',
      tag: group.attrs['data-node-tag'] ?? '',
      kind: group.attrs['data-node-kind'] ?? '',
      rows,
      box: rectBox(shape, origin),
    });
  }

  const edges = [];
  const seenEdges = new Set();
  for (const element of findAll(svg, (el) => el.attrs['data-edge-from'] !== undefined && el.attrs['data-edge-to'] !== undefined)) {
    const key = [element.attrs['data-edge-from'], element.attrs['data-edge-to'], element.attrs['data-edge-key'] ?? '', element.attrs['data-edge-id'] ?? ''].join('\u0000');
    if (seenEdges.has(key)) continue;
    const pathElement = element.attrs['data-composition-points'] || element.attrs.d
      ? element
      : findFirst(element, (el) => el.attrs['data-composition-points'] || el.name === 'path' || el.name === 'line');
    const points = pathElement ? elementPoints(pathElement, origin) : [];
    if (points.length < 2) continue;
    seenEdges.add(key);
    const className = pathElement.attrs.class ?? element.attrs.class ?? '';
    edges.push({
      from: element.attrs['data-edge-from'],
      to: element.attrs['data-edge-to'],
      label: element.attrs['data-edge-label'] ?? '',
      variant: (/\ba-[a-z-]+/.exec(className) ?? ['a-default'])[0],
      dashed: Boolean(pathElement.attrs['stroke-dasharray']) || /\ba-dashed\b/.test(className),
      arrow: /arrow/.test(pathElement.attrs['marker-end'] ?? element.attrs['marker-end'] ?? 'arrow'),
      points,
    });
  }

  return { width, height, frames, nodes: [...nodes.values()], edges, lifelines: lifelinesFor(nodes, edges) };
}

function rectBox(rect, origin) {
  return {
    x: Number(rect.attrs.x ?? 0) - origin.x,
    y: Number(rect.attrs.y ?? 0) - origin.y,
    width: Number(rect.attrs.width ?? 0),
    height: Number(rect.attrs.height ?? 0),
  };
}

function elementPoints(element, origin) {
  const shift = ([x, y]) => [x - origin.x, y - origin.y];
  const composed = element.attrs['data-composition-points'];
  if (composed) {
    return composed.split(';').map((pair) => pair.split(',').map(Number)).filter((point) => point.every(Number.isFinite)).map(shift);
  }
  if (element.name === 'line') {
    return [[Number(element.attrs.x1), Number(element.attrs.y1)], [Number(element.attrs.x2), Number(element.attrs.y2)]].map(shift);
  }
  return pathPoints(element.attrs.d ?? '').map(shift);
}

// Reads the vertices of an absolute SVG path. Curve control points are
// dropped; the renderer only uses short corner curves between straight runs.
export function pathPoints(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const points = [];
  let command = '';
  let current = [0, 0];
  let index = 0;
  const take = () => Number(tokens[index++]);
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index])) command = tokens[index++];
    switch (command) {
      case 'M': case 'L': current = [take(), take()]; points.push(current); if (command === 'M') command = 'L'; break;
      case 'H': current = [take(), current[1]]; points.push(current); break;
      case 'V': current = [current[0], take()]; points.push(current); break;
      case 'Q': take(); take(); current = [take(), take()]; points.push(current); break;
      case 'C': take(); take(); take(); take(); current = [take(), take()]; points.push(current); break;
      case 'Z': case 'z': index = tokens.length; break;
      default: index = tokens.length;
    }
  }
  return dedupeCollinear(points);
}

function dedupeCollinear(points) {
  const result = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    const prev = result[result.length - 2];
    if (prev && last && collinear(prev, last, point)) result[result.length - 1] = point;
    else result.push(point);
  }
  return result;
}

function collinear(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 0.5;
}

function touches(box, [x, y]) {
  return x >= box.x - ENDPOINT_TOLERANCE && x <= box.x + box.width + ENDPOINT_TOLERANCE
    && y >= box.y - ENDPOINT_TOLERANCE && y <= box.y + box.height + ENDPOINT_TOLERANCE;
}

// Sequence messages end on lifelines below their participant, not on the
// participant box. Draw a lifeline for any node with such detached endpoints.
function lifelinesFor(nodes, edges) {
  const reach = new Map();
  for (const edge of edges) {
    for (const [id, point] of [[edge.from, edge.points[0]], [edge.to, edge.points[edge.points.length - 1]]]) {
      const node = nodes.get(id);
      if (!node || touches(node.box, point)) continue;
      const below = point[1] > node.box.y + node.box.height
        && point[0] >= node.box.x - ENDPOINT_TOLERANCE && point[0] <= node.box.x + node.box.width + ENDPOINT_TOLERANCE;
      if (below) reach.set(id, Math.max(reach.get(id) ?? 0, point[1]));
    }
  }
  // Lifelines share one bottom, like the rendered sequence does.
  const bottom = Math.max(0, ...reach.values()) + 24;
  return [...reach.keys()].map((id) => {
    const { box } = nodes.get(id);
    return { id, x: box.x + box.width / 2, top: box.y + box.height, bottom };
  });
}

export function diagramToDrawio(diagram, { title = 'Diagram' } = {}) {
  const cells = [];
  const cellIds = new Map();
  let next = 2;
  const nextId = () => `c${next++}`;

  // Larger frames first so nested frames and nodes render above them.
  const frames = [...diagram.frames].sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  for (const frame of frames) {
    const style = (FRAME_STYLES[frame.kind] ?? DEFAULT_FRAME_STYLE)
      + 'html=1;whiteSpace=wrap;verticalAlign=top;align=left;spacingLeft=10;spacingTop=4;fontSize=11;fontStyle=1;fontColor=#334155;container=0;';
    cells.push(vertex(nextId(), frame.label, style, frame.box));
  }

  for (const lifeline of diagram.lifelines) {
    cells.push(edgeCell(nextId(), '', 'endArrow=none;dashed=1;strokeColor=#94A3B8;html=1;', {
      sourcePoint: [lifeline.x, lifeline.top],
      targetPoint: [lifeline.x, lifeline.bottom],
      waypoints: [],
    }));
  }

  for (const node of diagram.nodes) {
    const look = NODE_STYLES[node.kind] ?? DEFAULT_NODE_STYLE;
    const shape = look.shape === 'cylinder'
      ? 'shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=8;'
      : look.shape === 'rhombus' ? 'rhombus;' : 'rounded=1;arcSize=12;';
    const align = node.rows.length ? 'verticalAlign=top;align=left;spacingLeft=8;spacingTop=4;' : 'verticalAlign=middle;align=center;';
    const style = `${shape}whiteSpace=wrap;html=1;fillColor=${look.fill};strokeColor=${look.stroke};fontColor=#0F172A;fontSize=12;${align}`;
    const id = nextId();
    cellIds.set(node.id, id);
    cells.push(vertex(id, nodeLabel(node), style, node.box, { tooltip: [node.kind, node.tag].filter(Boolean).join(' · ') }));
  }

  const nodesById = new Map(diagram.nodes.map((node) => [node.id, node]));
  for (const edge of diagram.edges) {
    const source = nodesById.get(edge.from);
    const target = nodesById.get(edge.to);
    const first = edge.points[0];
    const last = edge.points[edge.points.length - 1];
    const attachSource = source && touches(source.box, first);
    const attachTarget = target && touches(target.box, last);
    let style = `edgeStyle=none;rounded=1;html=1;endArrow=${edge.arrow ? 'blockThin' : 'none'};endFill=1;fontSize=10;labelBackgroundColor=#FFFFFF;`
      + (EDGE_STYLES[edge.variant] ?? EDGE_STYLES['a-default'])
      + (edge.dashed && !/dashed=1/.test(EDGE_STYLES[edge.variant] ?? '') ? 'dashed=1;' : '');
    if (attachSource) style += anchorStyle('exit', source.box, first);
    if (attachTarget) style += anchorStyle('entry', target.box, last);
    cells.push(edgeCell(nextId(), edge.label, style, {
      source: attachSource ? cellIds.get(edge.from) : null,
      target: attachTarget ? cellIds.get(edge.to) : null,
      sourcePoint: first,
      targetPoint: last,
      waypoints: edge.points.slice(1, -1),
    }));
  }

  const width = Math.ceil(diagram.width);
  const height = Math.ceil(diagram.height);
  const diagramId = createHash('sha256').update(title).digest('hex').slice(0, 20);
  return [
    `<mxfile host="autodocs" agent="autodocs" version="24.7.17">`,
    `  <diagram id="${diagramId}" name="${xmlAttr(title)}">`,
    `    <mxGraphModel dx="${width}" dy="${height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">`,
    '      <root>',
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
    ...cells.map((cell) => `        ${cell}`),
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
    '',
  ].join('\n');
}

function nodeLabel(node) {
  const parts = [`<b>${htmlText(node.label)}</b>`];
  if (node.sublabel) parts.push(`<font style="font-size:10px;color:#475569">${htmlText(node.sublabel)}</font>`);
  if (node.tag) parts.push(`<font style="font-size:9px;color:#64748B">${htmlText(node.tag)}</font>`);
  if (node.rows.length) parts.push(`<font style="font-size:10px">${node.rows.map(htmlText).join('<br>')}</font>`);
  return parts.join('<br>');
}

function anchorStyle(prefix, box, [x, y]) {
  const rx = clamp01(box.width ? (x - box.x) / box.width : 0.5);
  const ry = clamp01(box.height ? (y - box.y) / box.height : 0.5);
  return `${prefix}X=${round(rx)};${prefix}Y=${round(ry)};${prefix}Dx=0;${prefix}Dy=0;${prefix}Perimeter=0;`;
}

function vertex(id, value, style, box, { tooltip = '' } = {}) {
  const tooltipAttr = tooltip ? ` tooltip="${xmlAttr(tooltip)}"` : '';
  return `<mxCell id="${id}" value="${xmlAttr(value)}" style="${xmlAttr(style)}" vertex="1" parent="1"${tooltipAttr}>`
    + `<mxGeometry x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" as="geometry" /></mxCell>`;
}

function edgeCell(id, value, style, { source = null, target = null, sourcePoint, targetPoint, waypoints }) {
  const ends = `${source ? ` source="${source}"` : ''}${target ? ` target="${target}"` : ''}`;
  const point = (as, [x, y]) => `<mxPoint x="${round(x)}" y="${round(y)}" as="${as}" />`;
  const array = waypoints.length
    ? `<Array as="points">${waypoints.map(([x, y]) => `<mxPoint x="${round(x)}" y="${round(y)}" />`).join('')}</Array>`
    : '';
  return `<mxCell id="${id}" value="${xmlAttr(value)}" style="${xmlAttr(style)}" edge="1" parent="1"${ends}>`
    + `<mxGeometry relative="1" as="geometry">${point('sourcePoint', sourcePoint)}${point('targetPoint', targetPoint)}${array}</mxGeometry></mxCell>`;
}

function htmlText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
