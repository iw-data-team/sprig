import { useEffect, useRef, useState } from "react";
import MindElixir, {
  type MindElixirInstance,
  type MindElixirData,
  type NodeObj,
} from "mind-elixir";
import {
  Sprout,
  Plus,
  ArrowRight,
  Undo2,
  Redo2,
  Download,
  Upload,
  Maximize,
  Minus,
  Bold,
  Trash2,
  X,
  FolderOpen,
  Check,
  CircleHelp,
  Pencil,
  ChevronDown,
} from "lucide-react";
import "mind-elixir/style";
import "./App.css";
import { clean, colors, theme } from "./model";

type Doc = { id: string; data: MindElixirData; updated: number };
const KEY = "sprig-maps-v1";
function fresh(sample = false): Doc {
  const data = MindElixir.new(sample ? "Một ý tưởng lớn" : "Ý tưởng của bạn");
  data.direction = MindElixir.RIGHT;
  data.theme = theme;
  if (sample)
    data.nodeData.children = [
      {
        id: crypto.randomUUID(),
        topic: "Bắt đầu từ tò mò",
        children: [
          { id: crypto.randomUUID(), topic: "Điều gì có thể tốt hơn?" },
          { id: crypto.randomUUID(), topic: "Thử một góc nhìn mới" },
        ],
      },
      {
        id: crypto.randomUUID(),
        topic: "Kết nối những ý tưởng",
        children: [
          { id: crypto.randomUUID(), topic: "Ghi lại mọi suy nghĩ" },
          { id: crypto.randomUUID(), topic: "Tìm điểm chung" },
        ],
      },
      {
        id: crypto.randomUUID(),
        topic: "Biến thành hành động",
        children: [
          { id: crypto.randomUUID(), topic: "Chọn bước nhỏ đầu tiên" },
          { id: crypto.randomUUID(), topic: "Học hỏi · Điều chỉnh · Tiếp tục" },
        ],
      },
    ];
  return { id: crypto.randomUUID(), data, updated: Date.now() };
}
function load(): Doc[] {
  try {
    const docs = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(docs) && docs.length)
      return docs.map((d: Doc) => ({ ...d, data: clean(d.data) }));
  } catch {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(`${KEY}-recovery-${Date.now()}`, raw);
    } catch {
      /* Storage may be disabled. */
    }
  }
  return [fresh()];
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [docs, setDocs] = useState(load),
    [active, setActive] = useState(docs[0].id);
  const docsRef = useRef(docs),
    host = useRef<HTMLDivElement>(null),
    map = useRef<MindElixirInstance | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<NodeObj | null>(null),
    [zoom, setZoom] = useState(100);
  const [drawer, setDrawer] = useState(false),
    [help, setHelp] = useState(false),
    [exportMenu, setExportMenu] = useState(false);
  const [status, setStatus] = useState("Đã lưu trên máy"),
    [notice, setNotice] = useState("");
  const [history, setHistory] = useState({ undo: false, redo: false });
  const undoDepth = useRef(0),
    redoDepth = useRef(0),
    replay = useRef(false);
  const save = useRef<() => void>(() => {});
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  function navigateHistory(redo = false) {
    const m = map.current;
    if (!m || (redo ? redoDepth.current : undoDepth.current) === 0) return;
    replay.current = true;
    if (redo) {
      redoDepth.current--;
      undoDepth.current++;
      m.redo();
    } else {
      undoDepth.current--;
      redoDepth.current++;
      m.undo();
    }
    replay.current = false;
    setHistory({ undo: undoDepth.current > 0, redo: redoDepth.current > 0 });
    setSelected(m.currentNode ? { ...m.currentNode.nodeObj } : null);
    save.current();
    m.container.focus();
  }
  useEffect(() => {
    const el = host.current!,
      doc = docsRef.current.find((d) => d.id === active)!;
    const m = new MindElixir({
      el,
      direction: doc.data.direction,
      theme,
      locale: "en",
      toolBar: false,
      contextMenu: false,
      editable: true,
      allowUndo: true,
      alignment: "nodes",
      newTopicName: "Ý tưởng mới",
      scaleMin: 0.25,
      scaleMax: 2.5,
      generateMainBranch: ({ pT, pL, pW, pH, cT, cL, cW, cH, direction }) => {
        const x = direction === "lhs" ? pL - 8 : pL + pW + 8;
        const end = direction === "lhs" ? cL + cW + 8 : cL - 8;
        const y = pT + pH / 2,
          ey = cT + cH / 2,
          mid = (x + end) / 2;
        return `M ${x} ${y} C ${mid} ${y} ${mid} ${ey} ${end} ${ey}`;
      },
      generateSubBranch: ({
        pT,
        pL,
        pW,
        pH,
        cT,
        cL,
        cW,
        cH,
        direction,
        isFirst,
      }) => {
        const inset = isFirst ? -8 : 26;
        const x = direction === "lhs" ? pL + inset : pL + pW - inset;
        const end = direction === "lhs" ? cL + cW - 26 : cL + 26;
        const y = pT + pH / 2,
          ey = cT + cH / 2,
          mid = (x + end) / 2;
        return `M ${x} ${y} C ${mid} ${y} ${mid} ${ey} ${end} ${ey}`;
      },
      keypress: {
        Tab: () => void m.addChild(),
        Enter: () =>
          void (m.currentNode?.nodeObj.parent
            ? m.insertSibling("after")
            : m.addChild()),
      },
    });
    m.init(structuredClone(doc.data));
    map.current = m;
    undoDepth.current = 0;
    redoDepth.current = 0;
    // eslint-disable-next-line react/set-state-in-effect -- Synchronize controls with the newly created imperative editor instance.
    setHistory({ undo: false, redo: false });
    let timer: ReturnType<typeof setTimeout>;
    const persist = () => {
      const next = docsRef.current.map((d) =>
        d.id === active
          ? { id: active, data: m.getData(), updated: Date.now() }
          : d,
      );
      docsRef.current = next;
      setDocs(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
        setStatus("Đã lưu trên máy");
      } catch {
        setStatus("Chưa lưu được");
        setNotice(
          "Bộ nhớ trình duyệt đã đầy hoặc bị chặn. Hãy xuất JSON để giữ bản sao.",
        );
      }
    };
    const updateSelection = () =>
      setSelected(m.currentNode ? { ...m.currentNode.nodeObj } : null);
    save.current = persist;
    m.bus.addListener("operation", (info) => {
      if (info.name === "beginEdit") return;
      if (!replay.current) {
        undoDepth.current++;
        redoDepth.current = 0;
      }
      setHistory({ undo: undoDepth.current > 0, redo: redoDepth.current > 0 });
      setStatus("Đang lưu…");
      clearTimeout(timer);
      timer = setTimeout(persist, 180);
      updateSelection();
    });
    m.bus.addListener("expandNode", () => {
      clearTimeout(timer);
      timer = setTimeout(persist, 180);
    });
    m.bus.addListener("selectNodes", updateSelection);
    m.bus.addListener("selectNewNode", updateSelection);
    m.bus.addListener("unselectNodes", updateSelection);
    m.bus.addListener("scale", (s) => setZoom(Math.round(s * 100)));
    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.isComposing || e.keyCode === 229) {
        e.stopImmediatePropagation();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        persist();
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        ["z", "y"].includes(e.key.toLowerCase()) &&
        target.id !== "input-box"
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigateHistory(e.key.toLowerCase() === "y" || e.shiftKey);
        return;
      }
      if (
        target.id === "input-box" &&
        !e.shiftKey &&
        ["Tab", "Enter"].includes(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        target.blur();
        m.container.focus();
        if (e.key === "Tab" || !m.currentNode?.nodeObj.parent)
          void m.addChild();
        else void m.insertSibling("after");
      }
    };
    el.addEventListener("keydown", keydown, true);
    const resize = new ResizeObserver(() => {
      if (m.nodeData.children?.length) m.scaleFit();
      else m.toCenter();
    });
    resize.observe(el);
    const root = m.findEle(m.nodeData.id);
    m.selectNode(root);
    m.toCenter();
    m.container.focus();
    setZoom(100);
    persist();
    const flush = () => {
      (el.querySelector("#input-box") as HTMLElement | null)?.blur();
      persist();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(timer);
      flush();
      window.removeEventListener("pagehide", flush);
      resize.disconnect();
      el.removeEventListener("keydown", keydown, true);
      m.destroy();
      map.current = null;
    };
  }, [active]);
  function create(sample = false, data?: MindElixirData) {
    const doc = fresh(sample);
    if (data) doc.data = data;
    const next = [doc, ...docsRef.current];
    docsRef.current = next;
    setDocs(next);
    setActive(doc.id);
    setDrawer(false);
  }
  function style(patch: NonNullable<NodeObj["style"]>) {
    const m = map.current,
      t = m?.currentNode;
    if (t) {
      void m!.reshapeNode(t, { style: { ...t.nodeObj.style, ...patch } });
      m!.container.focus();
    }
  }
  async function exportFile(format: "json" | "svg" | "png") {
    const m = map.current!;
    setExportMenu(false);
    (host.current?.querySelector("#input-box") as HTMLElement | null)?.blur();
    const name =
      m.nodeData.topic.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) ||
      "mindmap";
    try {
      const blob =
        format === "json"
          ? new Blob([JSON.stringify(m.getData(), null, 2)], {
              type: "application/json",
            })
          : format === "svg"
            ? m.exportSvg()
            : await m.exportPng();
      if (!blob) throw Error();
      download(blob, `${name}.${format}`);
    } catch {
      setNotice(
        "Không xuất được hình. Bạn có thể xuất JSON để giữ toàn bộ sơ đồ.",
      );
    }
  }
  return (
    <main>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setDrawer(!drawer)}
          aria-label="Mở danh sách sơ đồ"
        >
          <span className="brand-mark">
            <Sprout size={25} />
          </span>
          sprig<span className="beta">BETA</span>
        </button>
        <span className="header-divider" />
        <button className="document-title" onClick={() => setDrawer(!drawer)}>
          <span>{docs.find((d) => d.id === active)?.data.nodeData.topic}</span>
          <ChevronDown size={14} />
        </button>
        <span className="saved">
          <Check size={13} />
          {status}
        </span>
        <div className="header-actions">
          <button
            className="text-button help-toggle"
            onClick={() => setHelp(!help)}
          >
            <CircleHelp size={17} />
            Hướng dẫn
          </button>
          <button
            className="text-button"
            onClick={() => file.current?.click()}
            title="Nhập file JSON"
          >
            <Upload size={17} />
            <span>Nhập</span>
          </button>
          <div className="export-wrap">
            <button
              className="primary-button"
              onClick={() => setExportMenu(!exportMenu)}
            >
              <Download size={16} />
              <span>Xuất sơ đồ</span>
              <ChevronDown size={13} />
            </button>
            {exportMenu && (
              <>
                <button
                  className="backdrop"
                  aria-label="Đóng menu xuất"
                  onClick={() => setExportMenu(false)}
                />
                <div className="export-menu">
                  <button onClick={() => void exportFile("json")}>
                    JSON <small>Lưu để chỉnh sửa tiếp</small>
                  </button>
                  <button onClick={() => void exportFile("png")}>
                    Ảnh PNG <small>Chia sẻ hình ảnh</small>
                  </button>
                  <button onClick={() => void exportFile("svg")}>
                    Ảnh SVG <small>Phóng to không vỡ nét</small>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="canvas" ref={host} aria-label="Vùng chỉnh sửa mindmap" />
      <div className="canvas-label">
        <span className="live-dot" /> KHÔNG GIAN CHO Ý TƯỞNG
      </div>
      <div className="format-bar" aria-label="Định dạng node">
        <span className="toolbar-label">VĂN BẢN</span>
        <select
          aria-label="Cỡ chữ"
          value={
            selected?.style?.fontSize || (selected?.parent ? "20px" : "30px")
          }
          disabled={!selected}
          onChange={(e) => style({ fontSize: e.target.value })}
        >
          {[14, 16, 18, 20, 24, 30, 36, 48].map((n) => (
            <option key={n} value={`${n}px`}>
              {n}
            </option>
          ))}
        </select>
        <button
          title="In đậm"
          aria-label="In đậm"
          aria-pressed={selected?.style?.fontWeight === "700"}
          disabled={!selected}
          onClick={() =>
            style({
              fontWeight: selected?.style?.fontWeight === "700" ? "400" : "700",
            })
          }
        >
          <Bold size={17} />
        </button>
        <span className="tool-divider" />
        {colors.map((c) => (
          <button
            key={c}
            aria-label={`Màu ${c}`}
            title="Màu chữ và nhánh"
            className="color-button"
            disabled={!selected}
            onClick={() => {
              const m = map.current,
                t = m?.currentNode;
              if (t) {
                void m!.reshapeNode(t, {
                  branchColor: c,
                  style: { ...t.nodeObj.style, color: c },
                });
                m!.container.focus();
              }
            }}
          >
            <span style={{ background: c }}>
              {selected?.style?.color === c && <Check size={12} />}
            </span>
          </button>
        ))}
        <span className="tool-divider" />
        <button
          aria-label="Sửa chữ"
          title="Sửa chữ · F2 / nhấp đúp"
          disabled={!selected}
          onClick={() => void map.current?.beginEdit()}
        >
          <Pencil size={16} />
        </button>
        <button
          className="delete"
          aria-label="Xóa node"
          title="Xóa node · Delete"
          disabled={!selected?.parent}
          onClick={() => {
            const m = map.current;
            if (m?.currentNode?.nodeObj.parent)
              void m.removeNodes(m.currentNodes);
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="create-controls">
        <button
          className="add-child"
          onClick={() => void map.current?.addChild()}
          disabled={!selected}
        >
          <Plus size={17} />
          Nhánh con <kbd>Tab</kbd>
        </button>
        <button
          onClick={() => {
            const m = map.current;
            if (m?.currentNode?.nodeObj.parent) void m.insertSibling("after");
            else void m?.addChild();
          }}
          disabled={!selected}
        >
          Cùng cấp <kbd>Enter</kbd>
        </button>
      </div>
      <aside
        className={`starter-card ${docs.find((d) => d.id === active)?.data.nodeData.children?.length ? "hidden" : ""}`}
      >
        <span className="eyebrow">MỘT Ý TƯỞNG. VÔ VÀN KHẢ NĂNG.</span>
        <h1>
          Cứ để suy nghĩ
          <br />
          đâm chồi.
        </h1>
        <p>
          Nhấp đúp vào node để viết.
          <br />
          Phần còn lại, để bàn phím dẫn lối.
        </p>
        <div className="shortcut">
          <kbd>Tab</kbd>
          <span>Thêm nhánh con</span>
        </div>
        <div className="shortcut">
          <kbd>Enter</kbd>
          <span>Thêm nhánh cùng cấp</span>
        </div>
        <button onClick={() => create(true)}>
          Khám phá sơ đồ mẫu <ArrowRight size={14} />
        </button>
      </aside>
      <footer>
        <span className="privacy">
          <span className="live-dot" />
          Chỉ lưu trên trình duyệt này <span className="footer-dot">·</span> Tự
          do nghĩ, thoải mái viết.
        </span>
        <div className="view-controls">
          <button
            aria-label="Hoàn tác"
            title="Hoàn tác · ⌘/Ctrl Z"
            disabled={!history.undo}
            onClick={() => navigateHistory()}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="Làm lại"
            title="Làm lại · ⌘/Ctrl Shift Z"
            disabled={!history.redo}
            onClick={() => navigateHistory(true)}
          >
            <Redo2 size={17} />
          </button>
          <span className="tool-divider" />
          <button
            aria-label="Thu nhỏ"
            onClick={() =>
              map.current?.scale(
                Math.max(0.25, (map.current?.scaleVal || 1) - 0.1),
              )
            }
          >
            <Minus size={17} />
          </button>
          <button
            className="zoom-value"
            title="Đặt về 100%"
            onClick={() => map.current?.scale(1)}
          >
            {zoom}%
          </button>
          <button
            aria-label="Phóng to"
            onClick={() =>
              map.current?.scale(
                Math.min(2.5, (map.current?.scaleVal || 1) + 0.1),
              )
            }
          >
            <Plus size={17} />
          </button>
          <span className="tool-divider" />
          <button
            aria-label="Vừa màn hình"
            title="Vừa màn hình"
            onClick={() => {
              map.current?.scaleFit();
            }}
          >
            <Maximize size={16} />
          </button>
        </div>
      </footer>
      {drawer && (
        <>
          <button
            className="scrim"
            aria-label="Đóng danh sách"
            onClick={() => setDrawer(false)}
          />
          <aside className="drawer">
            <div className="drawer-heading">
              <h2>Sơ đồ của bạn</h2>
              <button aria-label="Đóng" onClick={() => setDrawer(false)}>
                <X size={20} />
              </button>
            </div>
            <p>
              Lưu riêng trên trình duyệt này. Xuất JSON để sao lưu hoặc chuyển
              sang máy khác.
            </p>
            <button className="primary-button new-map" onClick={() => create()}>
              <Plus size={17} />
              Tạo sơ đồ mới
            </button>
            <div className="doc-list">
              {docs.map((d) => (
                <button
                  className={d.id === active ? "active" : ""}
                  key={d.id}
                  onClick={() => {
                    setActive(d.id);
                    setDrawer(false);
                  }}
                >
                  <FolderOpen size={18} />
                  <span>
                    {d.data.nodeData.topic}
                    <small>
                      {new Date(d.updated).toLocaleDateString("vi-VN")}
                    </small>
                  </span>
                  {d.id === active && <Check size={15} />}
                </button>
              ))}
            </div>
            <div className="drawer-credit">
              Được xây dựng cùng{" "}
              <a
                href="https://github.com/SSShooter/mind-elixir-core"
                target="_blank"
                rel="noreferrer"
              >
                Mind Elixir ↗
              </a>
              <br />
              Mã nguồn mở. Không cần tài khoản.
            </div>
          </aside>
        </>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Hướng dẫn"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Đóng hướng dẫn"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <Sprout size={30} />
            <h2>Từ ý nghĩ đến sơ đồ.</h2>
            <p>Chọn một node, rồi dùng các phím dưới đây.</p>
            {[
              ["Tab", "Tạo nhánh con, kể cả khi đang gõ"],
              ["Enter", "Tạo cùng cấp; ở gốc sẽ tạo nhánh con"],
              ["F2 / Nhấp đúp", "Chỉnh sửa nội dung"],
              ["Shift + Enter", "Xuống dòng khi đang sửa chữ"],
              ["Esc", "Hủy phần chữ đang sửa"],
              ["Delete", "Xóa node và các nhánh con"],
              ["⌘ / Ctrl + Z", "Hoàn tác"],
              ["Kéo nền / Cuộn", "Di chuyển trên sơ đồ"],
            ].map(([key, text]) => (
              <div className="help-row" key={key}>
                <kbd>{key}</kbd>
                <span>{text}</span>
              </div>
            ))}
            <p className="help-note">
              Sơ đồ tự lưu trên trình duyệt. Dùng Xuất JSON để sao lưu; gửi file
              đó cho người khác để họ nhập và chỉnh sửa bản riêng.
            </p>
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Đóng thông báo" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            if (f.size > 5_000_000)
              throw Error("File quá lớn. Giới hạn là 5 MB.");
            create(false, clean(JSON.parse(await f.text())));
            setNotice("Đã nhập thành một sơ đồ mới.");
          } catch (err) {
            setNotice(
              err instanceof Error ? err.message : "Không đọc được file JSON.",
            );
          }
        }}
      />
    </main>
  );
}
