import MindElixir, { type MindElixirData, type NodeObj } from "mind-elixir";

export const colors = [
  "#5078ef",
  "#32a58b",
  "#e8a344",
  "#bc7bd1",
  "#e57985",
  "#687d94",
];

export const theme = {
  ...MindElixir.THEME,
  name: "Sprig",
  palette: colors,
  cssVar: {
    ...MindElixir.THEME.cssVar,
    "--bgcolor": "#fcfcfa",
    "--color": "#3f4948",
    "--main-color": "#3f4948",
    "--main-bgcolor": "transparent",
    "--root-color": "#293b34",
    "--root-bgcolor": "transparent",
    "--root-border-color": "transparent",
    "--selected": "#34a286",
    "--node-gap-x": "24px",
    "--node-gap-y": "0px",
    "--main-gap-x": "40px",
    "--main-gap-y": "10px",
    "--topic-padding": "4px 10px",
    "--main-radius": "10px",
    "--root-radius": "12px",
  },
};

// Accept the plain-text subset used by Sprig, never imported HTML or URLs.
export function clean(value: unknown): MindElixirData {
  let count = 0;
  const ids = new Set<string>();
  function node(v: unknown, depth = 0): NodeObj {
    if (!v || typeof v !== "object" || depth > 60 || ++count > 3000)
      throw Error("Sơ đồ vượt giới hạn 3.000 node hoặc 60 cấp.");
    const n = v as NodeObj;
    if (
      typeof n.topic !== "string" ||
      n.topic.length > 10000 ||
      !n.topic.trim()
    )
      throw Error("File có nội dung node không hợp lệ.");
    const id =
      typeof n.id === "string" && /^[\w-]{1,100}$/.test(n.id)
        ? n.id
        : crypto.randomUUID();
    if (ids.has(id)) throw Error("File có ID node trùng nhau.");
    ids.add(id);
    const style: NonNullable<NodeObj["style"]> = {};
    if (n.style) {
      if (/^(1[2-9]|[2-4]\d|5[0-6])px$/.test(n.style.fontSize || ""))
        style.fontSize = n.style.fontSize;
      if (/^#[\da-f]{6}$/i.test(n.style.color || ""))
        style.color = n.style.color;
      if (["400", "700"].includes(n.style.fontWeight || ""))
        style.fontWeight = n.style.fontWeight;
    }
    if (n.children !== undefined && !Array.isArray(n.children))
      throw Error("Danh sách node không hợp lệ.");
    return {
      id,
      topic: n.topic,
      style,
      expanded: n.expanded !== false,
      ...(n.direction === 0 || n.direction === 1
        ? { direction: n.direction }
        : {}),
      ...(/^#[\da-f]{6}$/i.test(n.branchColor || "")
        ? { branchColor: n.branchColor }
        : {}),
      ...(n.children
        ? { children: n.children.map((c) => node(c, depth + 1)) }
        : {}),
    };
  }
  if (!value || typeof value !== "object" || !("nodeData" in value))
    throw Error("Hãy chọn file JSON đã xuất từ Sprig.");
  const input = value as MindElixirData;
  return {
    nodeData: node(input.nodeData),
    direction: [0, 1, 2].includes(input.direction ?? -1) ? input.direction : 1,
    theme,
  };
}
