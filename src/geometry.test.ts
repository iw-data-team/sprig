// @ts-ignore Node test modules are resolved by tsx, outside browser app types.
import assert from "node:assert/strict";
// @ts-ignore Node test modules are resolved by tsx, outside browser app types.
import test from "node:test";
import type { MindElixirInstance } from "mind-elixir";
import { mainBranch, subBranch } from "./branches";
import { installViewport } from "./viewport";

const points = {
  pT: 0,
  pL: 0,
  pW: 200,
  pH: 40,
  cT: 100,
  cL: 200,
  cW: 250,
  cH: 40,
  direction: "rhs",
};
test("sub-branches start at the topic edge and have a real horizontal span", () => {
  const map = {
    container: { style: { getPropertyValue: () => "88px" } },
  } as unknown as MindElixirInstance;
  const path = subBranch.call(map, points);
  assert.match(path, /^M 204 20 C /);
  assert.ok(path.endsWith("284 120"));
  assert.match(mainBranch(points), /^M 204 20 C /);
  assert.ok(mainBranch(points).endsWith("196 120"));
});

test("left branches mirror the right edge attachment", () => {
  const map = {
    container: { style: { getPropertyValue: () => "100px" } },
  } as unknown as MindElixirInstance;
  const path = subBranch.call(map, {
    ...points,
    pL: 500,
    cL: 0,
    direction: "lhs",
  });
  assert.match(path, /^M 496 20 C /);
  assert.ok(path.endsWith("154 120"));
});

function viewportFixture(offscreen = false) {
  let layoutX = 0,
    layoutY = 0,
    panX = 0,
    panY = 0;
  const moves: number[][] = [];
  const rect = (x: number, y: number) => ({
    left: x + panX + layoutX,
    top: y + panY + layoutY,
    right: x + 100 + panX + layoutX,
    bottom: y + 30 + panY + layoutY,
    width: 100,
    height: 30,
  });
  const anchor = {
    nodeObj: { id: "anchor" },
    getBoundingClientRect: () => rect(300, 250),
  };
  const next = {
    nodeObj: { id: "next" },
    getBoundingClientRect: () => rect(offscreen ? 1050 : 500, 300),
  };
  const map = {
    currentNode: anchor,
    scaleVal: 1.7,
    container: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 700,
      }),
    },
    move: (x: number, y: number) => {
      panX += x;
      panY += y;
      moves.push([x, y]);
    },
    findEle: () => anchor,
    scrollIntoView: () => {},
    addChild: async () => {
      layoutX += 50;
      layoutY += 60;
      map.currentNode = next;
      map.scrollIntoView();
    },
    insertSibling: async () => {
      layoutX += 50;
      layoutY += 60;
      map.currentNode = next;
      map.scrollIntoView();
    },
  };
  return { map: map as unknown as MindElixirInstance, anchor, next, moves };
}

test("Tab/Enter preserve the source position and zoom after a tree relayout", async () => {
  for (const method of ["addChild", "insertSibling"] as const) {
    const { map, anchor, moves } = viewportFixture();
    installViewport(map);
    const before = anchor.getBoundingClientRect();
    if (method === "addChild") await map.addChild();
    else await map.insertSibling("after");
    assert.deepEqual(anchor.getBoundingClientRect(), before);
    assert.equal(map.scaleVal, 1.7);
    assert.deepEqual(moves, [[-50, -60]]);
  }
});

test("offscreen topics pan only to the nearest viewport edge, never to the center", async () => {
  const { map, next, moves } = viewportFixture(true);
  installViewport(map);
  await map.addChild();
  assert.equal(next.getBoundingClientRect().right, 970);
  assert.equal(map.scaleVal, 1.7);
  assert.deepEqual(moves, [
    [-50, -60],
    [-180, 0],
  ]);
});
