import type { MindElixirInstance } from "mind-elixir";

export function installViewport(map: MindElixirInstance) {
  let inserting = false;
  // A new topic should only pan enough to reveal the part outside the viewport.
  map.scrollIntoView = function (el: HTMLElement) {
    if (inserting) return;
    const rect = el.getBoundingClientRect(),
      view = map.container.getBoundingClientRect();
    const left = view.left + 30,
      right = view.right - 30;
    const top = view.top + 100,
      bottom = view.bottom - 130;
    const dx =
      rect.width > right - left
        ? left - rect.left
        : rect.left < left
          ? left - rect.left
          : rect.right > right
            ? right - rect.right
            : 0;
    const dy =
      rect.height > bottom - top
        ? top - rect.top
        : rect.top < top
          ? top - rect.top
          : rect.bottom > bottom
            ? bottom - rect.bottom
            : 0;
    if (dx || dy) map.move(dx, dy);
  };
  function keepAnchor<T extends unknown[]>(
    original: (...args: T) => Promise<void>,
  ) {
    return async (...args: T) => {
      const topic = map.currentNode;
      const before = topic?.getBoundingClientRect();
      const id = topic?.nodeObj.id;
      inserting = true;
      try {
        await original.apply(map, args);
        const anchor = id ? map.findEle(id) : null;
        if (before && anchor) {
          const after = anchor.getBoundingClientRect();
          map.move(before.left - after.left, before.top - after.top);
        }
      } finally {
        inserting = false;
      }
      if (map.currentNode) map.scrollIntoView(map.currentNode);
    };
  }
  map.addChild = keepAnchor(map.addChild);
  map.insertSibling = keepAnchor(map.insertSibling);
}
