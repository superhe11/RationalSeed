import { story, endingNodes, standardEndingIds } from "./story.ts";

export type GraphNode = { id: string; kind: "scene" | "choice" | "ending" | "resolver"; source: string; index?: number; chapter: number; label: string; x: number; y: number };
export type GraphEdge = { from: string; to: string; decision?: string };
export function buildRouteGraph(compact = false) {
  const nodeWidth = compact ? 176 : 224;
  const nodeHeight = compact ? 96 : 112;
  const columnStep = compact ? 216 : 296;
  // Keep branch tracks apart vertically. A route map is easier to read when it
  // grows downwards than when four answers are squeezed into one horizontal band.
  const rowStep = compact ? 140 : 166;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const targets = (next: string) => next === "resolve" ? ["resolve"] : [next];
  for (const node of Object.values(story)) {
    nodes.push({ id: node.id, kind: "scene", source: node.id, chapter: node.chapter, label: node.speaker, x: 0, y: 0 });
    if (node.choices) node.choices.forEach((choice, index) => {
      const id = `${node.id}:${index}`;
      nodes.push({ id, kind: "choice", source: node.id, index, chapter: node.chapter, label: choice.label, x: 0, y: 0 });
      edges.push({ from: node.id, to: id, decision: id });
      targets(choice.next).forEach(to => edges.push({ from: id, to, decision: id }));
    });
    else if (node.next) targets(node.next).forEach(to => edges.push({ from: node.id, to }));
  }
  // A single junction is only for endings still chosen by the accumulated
  // stats. Direct branches are drawn directly to their ending instead.
  if (edges.some(edge => edge.to === "resolve")) {
    nodes.push({ id: "resolve", kind: "resolver", source: "resolve", chapter: 10, label: "Итог по пути", x: 0, y: 0 });
    standardEndingIds.forEach(id => edges.push({ from: "resolve", to: `ending:${id}` }));
  }
  for (const [id, node] of Object.entries(endingNodes)) nodes.push({ id: `ending:${id}`, kind: "ending", source: id, chapter: node.chapter, label: node.chapterTitle, x: 0, y: 0 });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const incoming = new Map(nodes.map(node => [node.id, edges.filter(edge => edge.to === node.id)]));
  const depths = new Map<string, number>();
  const pending = new Set<string>();
  function depth(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    if (pending.has(id)) throw new Error(`Cycle in route graph: ${id}`);
    pending.add(id);
    const result = Math.max(0, ...incoming.get(id)!.map(edge => depth(edge.from) + 1));
    depths.set(id, result); pending.delete(id); return result;
  }
  nodes.forEach(node => depth(node.id));
  const columns = Array.from({ length: Math.max(...depths.values()) + 1 }, (_, column) => nodes.filter(node => depths.get(node.id) === column));
  columns.forEach((column, x) => {
    const average = (node: GraphNode) => {
      const parents = incoming.get(node.id)!;
      return parents.length ? parents.reduce((sum, edge) => sum + byId.get(edge.from)!.y, 0) / parents.length : 0;
    };
    // Barycentric order keeps sibling paths in their original order and puts a
    // merge beneath the middle of the paths that feed it. That is far less
    // confusing than the old top-aligned grid, which created crossing cables.
    column.sort((a, b) => average(a) - average(b) || a.id.localeCompare(b.id));
    const base = column.reduce((sum, node, row) => sum + average(node) - row * rowStep, 0) / column.length;
    const shift = Math.max(48 - base, 0);
    column.forEach((node, row) => { node.x = 16 + x * columnStep; node.y = base + shift + row * rowStep; });
  });
  const height = Math.max(...nodes.map(node => node.y + nodeHeight)) + 64;
  return { nodes, edges, nodeWidth, nodeHeight, width: columns.length * columnStep + 16, height };
}
