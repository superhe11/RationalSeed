import test from "node:test";
import assert from "node:assert/strict";
import { buildRouteGraph } from "../app/route-graph.ts";
import { story, endingNodes, choiceCount } from "../app/story.ts";

test("one horizontal graph includes every scene, answer and ending with no overlaps", () => {
  const graph = buildRouteGraph();
  assert.equal(graph.nodes.length, Object.keys(story).length + Object.keys(endingNodes).length + choiceCount);
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  assert.equal(byId.size, graph.nodes.length);
  for (const edge of graph.edges) {
    assert.ok(byId.has(edge.from)); assert.ok(byId.has(edge.to));
    assert.ok(byId.get(edge.to).x >= byId.get(edge.from).x + 296);
  }
  for (const node of graph.nodes) {
    assert.ok(node.x >= 0 && node.y >= 0 && node.x + 224 <= graph.width && node.y + 112 <= graph.height);
    for (const other of graph.nodes) if (other !== node) assert.ok(Math.abs(node.x - other.x) >= 224 || Math.abs(node.y - other.y) >= 112);
  }
  for (const node of Object.values(story)) node.choices?.forEach((choice, index) => {
    const id = `${node.id}:${index}`;
    assert.ok(graph.edges.some(edge => edge.from === node.id && edge.to === id && edge.decision === id));
    if (choice.next !== "resolve") assert.ok(graph.edges.some(edge => edge.from === id && edge.to === choice.next));
    else for (const ending of Object.keys(endingNodes)) assert.ok(graph.edges.some(edge => edge.from === id && edge.to === `ending:${ending}`));
  });
});
