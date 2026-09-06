import { story, endingNodes } from "./story.ts";

export type GraphNode = { id: string; kind: "scene" | "choice" | "ending"; source: string; index?: number; chapter: number; label: string; x: number; y: number };
export type GraphEdge = { from: string; to: string; decision?: string };
export function buildRouteGraph() {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const targets = (next: string) => next === "resolve" ? Object.keys(endingNodes).map(id => `ending:${id}`) : [next];
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
  const rows = Math.max(...columns.map(column => column.length));
  columns.forEach((column, x) => {
    const average = (node: GraphNode) => {
      const parents = incoming.get(node.id)!;
      return parents.length ? parents.reduce((sum, edge) => sum + byId.get(edge.from)!.y, 0) / parents.length : 0;
    };
    column.sort((a, b) => average(a) - average(b));
    column.forEach((node, row) => { node.x = 24 + x * 296; node.y = 64 + (row + (rows - column.length) / 2) * 144; });
  });
  return { nodes, edges, width: columns.length * 296 + 24, height: rows * 144 + 88 };
}
