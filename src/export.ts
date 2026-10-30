import type { MindElixirInstance } from "mind-elixir";

const SVG_NS = "http://www.w3.org/2000/svg";
const PADDING = 100;
const MAX_PNG_SIDE = 8192;
const MAX_PNG_PIXELS = 40_000_000;

type LinePart = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function transparent(color: string) {
  return (
    color === "transparent" ||
    color === "rgba(0, 0, 0, 0)" ||
    color.endsWith(", 0)")
  );
}

function attr(el: Element, key: string, fallback: string) {
  return el.getAttribute(key) || fallback;
}

function lineParts(text: HTMLElement, scale: number): LinePart[] {
  const textNode = text.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return [];

  const raw = textNode.textContent || "";
  const range = document.createRange();
  const lines: LinePart[] = [];
  let current: LinePart | undefined;
  let lastTop: number | undefined;
  let offset = 0;

  for (const char of raw) {
    const nextOffset = offset + char.length;
    if (char === "\n" || char === "\r") {
      if (current) lines.push(current);
      current = undefined;
      lastTop = undefined;
      offset = nextOffset;
      continue;
    }

    range.setStart(textNode, offset);
    range.setEnd(textNode, nextOffset);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) {
      const top = rect.top / scale;
      if (current && lastTop !== undefined && Math.abs(top - lastTop) > 1.5) {
        lines.push(current);
        current = undefined;
      }
      if (!current)
        current = {
          text: "",
          left: rect.left / scale,
          top,
          right: rect.right / scale,
          bottom: rect.bottom / scale,
        };
      current.text += char;
      current.left = Math.min(current.left, rect.left / scale);
      current.right = Math.max(current.right, rect.right / scale);
      current.top = Math.min(current.top, top);
      current.bottom = Math.max(current.bottom, rect.bottom / scale);
      lastTop = top;
    }
    offset = nextOffset;
  }
  if (current) lines.push(current);
  range.detach();
  return lines;
}

function makeSvgNode(tag: string, attrs: Record<string, string>) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function addBranches(
  svg: SVGSVGElement,
  map: MindElixirInstance,
  nodesRect: DOMRect,
  scale: number,
) {
  const paths = document.createElementNS(SVG_NS, "g");
  paths.setAttribute("fill", "none");
  paths.setAttribute("transform", `translate(${PADDING} ${PADDING})`);
  for (const source of map.nodes.querySelectorAll<SVGSVGElement>(
    "svg.lines, svg.subLines",
  )) {
    const isSubline = source.classList.contains("subLines");
    const wrapper = isSubline
      ? source.closest<HTMLElement>("me-wrapper")
      : null;
    const wrapperRect = wrapper?.getBoundingClientRect();
    const x = wrapperRect ? (wrapperRect.left - nodesRect.left) / scale : 0;
    const y = wrapperRect ? (wrapperRect.top - nodesRect.top) / scale : 0;
    for (const sourcePath of source.querySelectorAll<SVGPathElement>(
      "path[d]",
    )) {
      const path = makeSvgNode("path", {
        d: attr(sourcePath, "d", ""),
        fill: "none",
        stroke: attr(sourcePath, "stroke", "#5078ef"),
        "stroke-width": "3",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        ...(sourcePath.hasAttribute("opacity")
          ? { opacity: sourcePath.getAttribute("opacity")! }
          : {}),
      });
      if (isSubline) path.setAttribute("transform", `translate(${x} ${y})`);
      paths.appendChild(path);
    }
  }
  svg.appendChild(paths);
}

function addNode(
  svg: SVGSVGElement,
  node: HTMLElement,
  nodesRect: DOMRect,
  scale: number,
  fontFamily: string,
) {
  const rect = node.getBoundingClientRect();
  const x = (rect.left - nodesRect.left) / scale + PADDING;
  const y = (rect.top - nodesRect.top) / scale + PADDING;
  const width = rect.width / scale;
  const height = rect.height / scale;
  const css = getComputedStyle(node);
  const background = css.backgroundColor;
  const borderColor = css.borderTopColor;
  const borderWidth = parseFloat(css.borderTopWidth);
  const radius = Math.max(0, parseFloat(css.borderTopLeftRadius) || 0);

  if (
    !transparent(background) ||
    (!transparent(borderColor) && borderWidth > 0)
  ) {
    const box = makeSvgNode("rect", {
      x: `${x}`,
      y: `${y}`,
      width: `${width}`,
      height: `${height}`,
      rx: `${radius}`,
      fill: transparent(background) ? "none" : background,
      stroke:
        transparent(borderColor) || borderWidth <= 0 ? "none" : borderColor,
      "stroke-width": `${borderWidth}`,
    });
    svg.appendChild(box);
  }

  const text = node.querySelector<HTMLElement>(":scope > .text");
  if (!text) return;
  const textCss = getComputedStyle(text);
  const size = parseFloat(textCss.fontSize);
  const weight = textCss.fontWeight || css.fontWeight;
  const color = textCss.color || css.color;
  const lineHeight =
    textCss.lineHeight === "normal"
      ? size * 1.2
      : parseFloat(textCss.lineHeight) || size * 1.2;
  for (const part of lineParts(text, scale)) {
    if (!part.text) continue;
    const label = makeSvgNode("text", {
      x: `${part.left - nodesRect.left / scale + PADDING}`,
      y: `${part.top + lineHeight * 0.82 - nodesRect.top / scale + PADDING}`,
      fill: color,
      "font-family": fontFamily,
      "font-size": `${size}`,
      "font-weight": weight,
      "dominant-baseline": "alphabetic",
      textLength: `${Math.max(0.1, part.right - part.left)}`,
      lengthAdjust: "spacingAndGlyphs",
    });
    // Labels are emitted as text nodes, never interpreted as markup or links.
    label.textContent = part.text;
    svg.appendChild(label);
  }
}

export async function exportSafeSvg(map: MindElixirInstance): Promise<Blob> {
  await document.fonts?.ready;
  const scale = map.scaleVal || 1;
  const nodesRect = map.nodes.getBoundingClientRect();
  const width = Math.ceil(map.nodes.offsetWidth + PADDING * 2);
  const height = Math.ceil(map.nodes.offsetHeight + PADDING * 2);
  if (!width || !height) throw Error("Sơ đồ chưa sẵn sàng để xuất.");

  const svg = makeSvgNode("svg", {
    xmlns: SVG_NS,
    width: `${width}`,
    height: `${height}`,
    viewBox: `0 0 ${width} ${height}`,
    version: "1.1",
  }) as SVGSVGElement;
  const background = getComputedStyle(map.container).backgroundColor;
  svg.appendChild(
    makeSvgNode("rect", {
      width: "100%",
      height: "100%",
      fill: transparent(background) ? "#ffffff" : background,
    }),
  );
  const selected = [...map.nodes.querySelectorAll(".selected")];
  try {
    selected.forEach((node) => node.classList.remove("selected"));
    addBranches(svg, map, nodesRect, scale);
    for (const node of map.nodes.querySelectorAll<HTMLElement>("me-tpc"))
      addNode(svg, node, nodesRect, scale, "Arial, sans-serif");
  } finally {
    selected.forEach((node) => node.classList.add("selected"));
  }
  return new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml;charset=utf-8",
  });
}

export async function exportSafePng(map: MindElixirInstance): Promise<Blob> {
  const svgBlob = await exportSafeSvg(map);
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error("Không thể dựng sơ đồ thành ảnh."));
    });
    image.src = svgUrl;
    await loaded;

    const ratio = Math.min(
      2,
      MAX_PNG_SIDE / image.width,
      MAX_PNG_SIDE / image.height,
      Math.sqrt(MAX_PNG_PIXELS / (image.width * image.height)),
    );
    if (!Number.isFinite(ratio) || ratio <= 0)
      throw Error("Sơ đồ quá lớn để xuất ảnh PNG.");
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(image.width * ratio));
    canvas.height = Math.max(1, Math.floor(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Không thể tạo vùng vẽ ảnh.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw Error("Không thể mã hóa ảnh PNG.");
    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
