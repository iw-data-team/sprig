// @ts-ignore Node's built-in test modules are resolved by tsx, outside the browser app's type set.
import assert from "node:assert/strict";
// @ts-ignore Node's built-in test modules are resolved by tsx, outside the browser app's type set.
import test from "node:test";
import { clean } from "./model.ts";

test("JSON roundtrip keeps Vietnamese text, nesting, styles, expansion, and direction", () => {
  const source = {
    direction: 2,
    nodeData: {
      id: "root-1",
      topic: "Ý tưởng lớn",
      expanded: true,
      style: { fontSize: "30px", color: "#293b34", fontWeight: "700" },
      children: [
        {
          id: "child-1",
          topic: "Nhánh tiếng Việt · có dấu",
          expanded: false,
          direction: 0,
          branchColor: "#5078ef",
          style: { fontSize: "18px", color: "#5078ef", fontWeight: "400" },
          children: [
            {
              id: "leaf-1",
              topic: "Thử nghiệm 🚀",
              expanded: true,
              style: { fontSize: "14px" },
            },
          ],
        },
      ],
    },
  };

  const result = clean(JSON.parse(JSON.stringify(source)));
  assert.equal(result.direction, 2);
  assert.deepEqual(result.nodeData, source.nodeData);
});

test("rejects non-array children and duplicate IDs", () => {
  assert.throws(
    () => clean({ nodeData: { id: "root", topic: "Root", children: {} } }),
    /Danh sách node/,
  );
  assert.throws(
    () =>
      clean({
        nodeData: {
          id: "same",
          topic: "Root",
          children: [{ id: "same", topic: "Child" }],
        },
      }),
    /ID node trùng/,
  );
});

test("rejects nesting deeper than 60 levels", () => {
  let node: Record<string, unknown> = { id: "n61", topic: "Deep" };
  for (let depth = 60; depth >= 0; depth--)
    node = { id: `n${depth}`, topic: "Deep", children: [node] };
  assert.throws(() => clean({ nodeData: node }), /60 cấp/);
});

test("keeps topic text literal while discarding imported markup, URLs, and unsafe styles", () => {
  const literal = "<img src=x onerror=alert(1)> javascript:alert(1)";
  const result = clean({
    direction: 1,
    nodeData: {
      id: "root",
      topic: literal,
      html: "<script>alert(1)</script>",
      url: "javascript:alert(1)",
      style: {
        fontSize: "url(javascript:alert(1))",
        color: "red; background:url(x)",
        fontWeight: "700; color:red",
      },
      branchColor: "url(javascript:alert(1))",
    },
  });
  assert.equal(result.nodeData.topic, literal);
  assert.deepEqual(result.nodeData.style, {});
  assert.equal(result.nodeData.branchColor, undefined);
  assert.equal("html" in result.nodeData, false);
  assert.equal("url" in result.nodeData, false);
});
