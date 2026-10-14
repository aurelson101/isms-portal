import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { expect, it } from "vitest";

it("has no identical CSS rules in the same conditional scope", () => {
  const root = postcss.parse(readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8"));
  const seen = new Set<string>(), duplicates: string[] = [];
  root.walkRules(rule => {
    const scope: string[] = []; let parent = rule.parent;
    while (parent && parent.type !== "root") {
      scope.unshift(parent.type === "atrule" ? `@${parent.name} ${parent.params}` : "nested"); parent = parent.parent;
    }
    const key = JSON.stringify([scope, rule.selector, rule.nodes.map(node => node.type === "decl" ? [node.prop, node.value, node.important] : node.toString())]);
    if (seen.has(key)) duplicates.push(rule.selector); seen.add(key);
  });
  expect(duplicates).toEqual([]);
});
