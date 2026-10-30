import type { MindElixirInstance } from "mind-elixir";

type Points = {
  pT: number;
  pL: number;
  pW: number;
  pH: number;
  cT: number;
  cL: number;
  cW: number;
  cH: number;
  direction: string;
};
export function branchPath(x: number, y: number, end: number, ey: number) {
  const span = end - x;
  return `M ${x} ${y} C ${x + span * 0.45} ${y} ${end - span * 0.55} ${ey} ${end} ${ey}`;
}
export function mainBranch({
  pT,
  pL,
  pW,
  pH,
  cT,
  cL,
  cW,
  cH,
  direction,
}: Points) {
  const left = direction === "lhs";
  return branchPath(
    left ? pL - 4 : pL + pW + 4,
    pT + pH / 2,
    left ? cL + cW + 4 : cL - 4,
    cT + cH / 2,
  );
}
export function subBranch(
  this: MindElixirInstance,
  { pT, pL, pW, pH, cT, cL, cW, cH, direction }: Points,
) {
  const gap =
    parseFloat(this.container.style.getPropertyValue("--node-gap-x")) || 88;
  const left = direction === "lhs";
  return branchPath(
    left ? pL - 4 : pL + pW + 4,
    pT + pH / 2,
    left ? cL + cW - gap + 4 : cL + gap - 4,
    cT + cH / 2,
  );
}
export function installBranchLayout(map: MindElixirInstance) {
  const original = map.linkDiv;
  map.linkDiv = function (...args) {
    // Give tall sibling groups a wider curve, with the same indent at every level.
    const height = Math.max(
      0,
      ...[...map.nodes.querySelectorAll<HTMLElement>("me-children")].map(
        (el) => el.offsetHeight,
      ),
    );
    const span = Math.max(88, Math.min(160, Math.round(height * 0.28)));
    map.container.style.setProperty("--node-gap-x", `${span}px`);
    return original.apply(map, args);
  };
  map.linkDiv();
}
