import { useCallback, useEffect, useRef, useState } from "react";
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
  Share2,
  Cloud,
  RefreshCw,
  LogOut,
} from "lucide-react";
import "mind-elixir/style";
import "./App.css";
import { clean, colors, theme } from "./model";
import { installInlineEditor } from "./inlineEditor";
import { mainBranch, subBranch, installBranchLayout } from "./branches";
import { installViewport } from "./viewport";
import { exportSafePng, exportSafeSvg } from "./export";

import {
  CloudRepository,
  errorMessage,
  siteUrl,
  type Doc,
  type Share,
} from "./cloud/repository";
import { ShareDialog } from "./components/CloudUi";

type AppProps = {
  cloud?: CloudRepository;
  initialDocs?: Doc[];
  initialActive?: string;
  onLogin?: () => void;
  onLogout?: () => void;
};
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

export default function App({
  cloud,
  initialDocs,
  initialActive,
  onLogin,
  onLogout,
}: AppProps) {
  const [docs, setDocs] = useState(() => initialDocs || load()),
    [active, setActive] = useState(initialActive || docs[0].id);
  const [epoch, setEpoch] = useState(0);
  const currentId = useRef(active);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");
  const [recovery, setRecovery] = useState(() =>
    cloud ? Object.values(cloud.drafts()) : [],
  );
  const [sharing, setSharing] = useState(false);
  const [members, setMembers] = useState<Share[]>([]);
  const [shareLoading, setShareLoading] = useState(false),
    [shareBusy, setShareBusy] = useState(false),
    [shareError, setShareError] = useState("");
  const activeDoc = docs.find((d) => d.id === active)!;
  const readOnly = activeDoc?.role === "viewer";
  const flushEditor = useRef<() => void>(() => {});
  const docsRef = useRef(docs),
    host = useRef<HTMLDivElement>(null),
    map = useRef<MindElixirInstance | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<NodeObj | null>(null),
    [zoom, setZoom] = useState(100);
  const [drawer, setDrawer] = useState(false),
    [help, setHelp] = useState(false),
    [exportMenu, setExportMenu] = useState(false);
  const [status, setStatus] = useState(
      cloud ? "Đã lưu trên cloud" : "Đã lưu trên máy",
    ),
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
  useEffect(() => {
    const m=map.current;
    if (!m) return;
    if (working || readOnly) m.disableEdit(); else m.enableEdit();
  }, [working, readOnly, active, epoch]);
  const navigateHistory = useCallback((redo = false) => {
    const m = map.current;
    if (readOnly || !m || (redo ? redoDepth.current : undoDepth.current) === 0)
      return;
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
  }, [readOnly]);
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
      editable: doc.role !== "viewer",
      allowUndo: true,
      alignment: "root",
      newTopicName: "Ý tưởng mới",
      scaleMin: 0.25,
      scaleMax: 2.5,
      generateMainBranch: mainBranch,
      generateSubBranch: subBranch,
      keypress: {
        Tab: () => void m.addChild(),
        Enter: () =>
          void (m.currentNode?.nodeObj.parent
            ? m.insertSibling("after")
            : m.addChild()),
      },
    });
    m.init(structuredClone({ ...doc.data, theme }));
    installInlineEditor(m);
    installBranchLayout(m);
    installViewport(m);
    map.current = m;
    undoDepth.current = 0;
    redoDepth.current = 0;
    // eslint-disable-next-line react/set-state-in-effect -- Synchronize controls with the newly created imperative editor instance.
    setHistory({ undo: false, redo: false });
    let timer: ReturnType<typeof setTimeout>;
    let dirty = false;
    const persist = () => {
      if (doc.role === "viewer" || (cloud && !dirty)) return;
      dirty = false;
      const next = docsRef.current.map((d) =>
        d.id === active ? { ...d, data: m.getData(), updated: Date.now() } : d,
      );
      docsRef.current = next;
      setDocs(next);
      if (cloud) {
        const payload = next.find((d) => d.id === active)!;
        setStatus("Đang lưu cloud…");
        void cloud
          .save(payload)
          .then((saved) => {
            const updated = docsRef.current.map((d) =>
              d.id === saved.id ? { ...d, version: saved.version } : d,
            );
            docsRef.current = updated;
            setDocs(updated);
            if (currentId.current === active) {
              setStatus(cloud.hasPending() ? "Đang lưu cloud…" : "Đã lưu trên cloud");
              setProblem("");
            }
          })
          .catch((error) => {
            if (currentId.current === active) {
              setStatus("Chưa đồng bộ");
              setProblem(errorMessage(error));
            }
          });
      } else {
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
          setStatus("Đã lưu trên máy");
        } catch {
          setStatus("Chưa lưu được");
          setNotice(
            "Bộ nhớ trình duyệt đã đầy hoặc bị chặn. Hãy xuất JSON để giữ bản sao.",
          );
        }
      }
    };
    const updateSelection = () =>
      setSelected(m.currentNode ? { ...m.currentNode.nodeObj } : null);
    save.current = () => {
      dirty = true;
      persist();
    };
    m.bus.addListener("operation", (info) => {
      if (info.name === "beginEdit" || doc.role === "viewer") return;
      dirty = true;
      if (!replay.current) {
        undoDepth.current++;
        redoDepth.current = 0;
      }
      setHistory({ undo: undoDepth.current > 0, redo: redoDepth.current > 0 });
      setStatus("Đang lưu…");
      clearTimeout(timer);
      timer = setTimeout(persist, cloud ? 700 : 180);
      updateSelection();
    });
    m.bus.addListener("expandNode", () => {
      if (doc.role === "viewer") return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(persist, cloud ? 700 : 180);
    });
    m.bus.addListener("selectNodes", updateSelection);
    m.bus.addListener("selectNewNode", updateSelection);
    m.bus.addListener("unselectNodes", updateSelection);
    m.bus.addListener("scale", (s) => setZoom(Math.round(s * 100)));
    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (doc.role === "viewer") return;
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
        target.id !== "input-box" &&
        m.currentNode &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.length === 1 &&
        e.key !== " "
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void m.beginEdit().then(() => {
          const input = el.querySelector("#input-box");
          if (input) {
            input.textContent = e.key;
            const range = document.createRange();
            range.selectNodeContents(input);
            range.collapse(false);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        });
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
    const root = m.findEle(m.nodeData.id);
    if (doc.role !== "viewer") m.selectNode(root);
    m.toCenter();
    m.container.focus();
    setZoom(100);
    if (!cloud) persist();
    if (
      doc.role !== "viewer" &&
      !m.nodeData.children?.length &&
      m.nodeData.topic === "Ý tưởng của bạn"
    )
      void m.beginEdit(root);
    let disposed = false;
    let interacted = false;
    const interact = () => {
      interacted = true;
    };
    const interactionTarget = el.parentElement!;
    interactionTarget.addEventListener("pointerdown", interact);
    interactionTarget.addEventListener("wheel", interact, { passive: true });
    interactionTarget.addEventListener("keydown", interact);
    void document.fonts.ready.then(() => {
      if (disposed) return;
      m.linkDiv();
      if (!interacted && m.nodeData.children?.length) m.scaleFit();
    });
    const flush = () => {
      (el.querySelector("#input-box") as HTMLElement | null)?.blur();
      persist();
    };
    flushEditor.current = flush;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (cloud?.hasPending()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      disposed = true;
      clearTimeout(timer);
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", beforeUnload);
      interactionTarget.removeEventListener("pointerdown", interact);
      interactionTarget.removeEventListener("wheel", interact);
      interactionTarget.removeEventListener("keydown", interact);
      el.removeEventListener("keydown", keydown, true);
      m.destroy();
      map.current = null;
    };
  }, [active, epoch, cloud, navigateHistory]);
  async function switchDoc(id: string, force = false) {
    if (working) return;
    setWorking(true);
    try {
      flushEditor.current();
      if (cloud) {
        if (force) await cloud.flush(active).catch(() => {});
        else await cloud.flush(active);
        const loaded = await cloud.get(id);
        const next = docsRef.current.map((d) => (d.id === id ? loaded : d));
        docsRef.current = next;
        setDocs(next);
        const url = new URL(location.href);
        url.searchParams.set("map", id);
        window.history.replaceState(null, "", url);
        setProblem("");
        setRecovery(Object.values(cloud.drafts()));
      }
      currentId.current = id;
      setActive(id);
      setEpoch((n) => n + 1);
      setDrawer(false);
      setStatus(cloud ? "Đã lưu trên cloud" : "Đã lưu trên máy");
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }
  async function create(sample = false, data?: MindElixirData) {
    if (working) return false;
    setWorking(true);
    try {
      flushEditor.current();
      if (cloud) await cloud.flush(active);
      let doc = fresh(sample);
      if (data) doc.data = data;
      if (cloud) doc = await cloud.create(doc.data);
      const next = [doc, ...docsRef.current];
      docsRef.current = next;
      setDocs(next);
      currentId.current = doc.id;
      setActive(doc.id);
      setDrawer(false);
      return true;
    } catch (error) {
      setProblem(errorMessage(error));
      setNotice(errorMessage(error));
      return false;
    } finally {
      setWorking(false);
    }
  }
  async function recoverDrafts() {
    if (!cloud || working) return;
    setWorking(true);
    try {
      flushEditor.current();
      await cloud.flush().catch(() => {});
      const drafts = Object.values(cloud.drafts());
      const imported: Doc[] = [];
      for (const draft of drafts) {
        const copy = await cloud.create(clean(draft.data));
        imported.push(copy);
        const next = [copy, ...docsRef.current];
        docsRef.current = next;
        setDocs(next);
        cloud.resolveDraft(draft.id);
      }
      setRecovery([]);
      if (imported[0]) { currentId.current=imported[0].id;setActive(imported[0].id); }
      setProblem("");
      setNotice("Đã giữ các bản nháp thành sơ đồ riêng trên cloud.");
    } catch (error) {
      setProblem(errorMessage(error));
      setRecovery(Object.values(cloud.drafts()));
    } finally {
      setWorking(false);
    }
  }
  async function migrateLocal() {
    if (!cloud || working) return;
    setWorking(true);
    try {
      flushEditor.current();
      await cloud.flush(active);
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as Doc[];
      const imported: Doc[] = [];
      for (const d of raw) {
        const copy = await cloud.create(clean(d.data), d.id);
        imported.push(copy);
        const next = [copy, ...docsRef.current.filter((doc) => doc.id !== copy.id)];
        docsRef.current = next;
        setDocs(next);
      }
      const ids = new Set(imported.map((d) => d.id));
      const next = [
        ...imported,
        ...docsRef.current.filter((d) => !ids.has(d.id)),
      ];
      docsRef.current = next;
      setDocs(next);
      setNotice(
        `Đã nhập ${imported.length} sơ đồ lên tài khoản. Bản cũ trên máy vẫn được giữ.`,
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }
  async function openShare() {
    if (!cloud || activeDoc.role !== "owner") return;
    setSharing(true);
    setShareLoading(true);
    setShareError("");
    try {
      flushEditor.current();
      await cloud.flush(active);
      setMembers(await cloud.shares(active));
    } catch (error) {
      setShareError(errorMessage(error));
    } finally {
      setShareLoading(false);
    }
  }
  async function changeShare(email: string, role: "viewer" | "editor") {
    if (!cloud) return;
    setShareBusy(true);
    setShareError("");
    try {
      await cloud.grant(active, email, role);
      setMembers(await cloud.shares(active));
    } catch (error) {
      setShareError(errorMessage(error));
    } finally {
      setShareBusy(false);
    }
  }
  async function revokeShare(id: string) {
    if (!cloud) return;
    setShareBusy(true);
    setShareError("");
    try {
      await cloud.revoke(active, id);
      setMembers(await cloud.shares(active));
    } catch (error) {
      setShareError(errorMessage(error));
    } finally {
      setShareBusy(false);
    }
  }
  async function signOut() {
    try {
      flushEditor.current();
      await cloud?.flush();
      onLogout?.();
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }
  function style(patch: NonNullable<NodeObj["style"]>) {
    const m = map.current,
      t = m?.currentNode;
    if (t && !readOnly) {
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
            ? await exportSafeSvg(m)
            : await exportSafePng(m);
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
          {cloud ? (
            <>
              <span className="account-email" title={cloud.user.email}>
                {cloud.user.email}
              </span>
              <span className={`role-badge role-${activeDoc.role}`}>
                {activeDoc.role === "owner"
                  ? "Riêng tư / Chủ sở hữu"
                  : readOnly
                    ? "Chỉ xem"
                    : "Được chỉnh sửa"}
              </span>
              <button
                className="text-button"
                title="Tải bản mới nhất từ cloud"
                aria-label="Đồng bộ từ cloud"
                disabled={working}
                onClick={() => void switchDoc(active)}
              >
                <RefreshCw size={16} />
              </button>
              {activeDoc.role === "owner" && (
                <button
                  className="text-button"
                  onClick={() => void openShare()}
                >
                  <Share2 size={16} />
                  Chia sẻ
                </button>
              )}
              <button
                className="text-button account-logout"
                aria-label="Đăng xuất"
                title="Đăng xuất"
                disabled={working}
                onClick={() => void signOut()}
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <button
              className="text-button cloud-login-button"
              onClick={onLogin}
            >
              <Cloud size={16} />
              Đăng nhập Google
            </button>
          )}
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
      <div
        className={`format-bar ${readOnly ? "viewer-hidden" : ""}`}
        aria-label="Định dạng node"
      >
        <span className="toolbar-label">VĂN BẢN</span>
        <select
          aria-label="Cỡ chữ"
          value={
            selected?.style?.fontSize ||
            (selected?.parent?.parent
              ? "18px"
              : selected?.parent
                ? "20px"
                : "30px")
          }
          disabled={!selected || readOnly || working}
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
          disabled={!selected || readOnly || working}
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
            disabled={!selected || readOnly || working}
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
          disabled={!selected || readOnly || working}
          onClick={() => void map.current?.beginEdit()}
        >
          <Pencil size={16} />
        </button>
        <button
          className="delete"
          aria-label="Xóa node"
          title="Xóa node · Delete"
          disabled={!selected?.parent || readOnly || working}
          onClick={() => {
            const m = map.current;
            if (m?.currentNode?.nodeObj.parent)
              void m.removeNodes(m.currentNodes);
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className={`create-controls ${readOnly ? "viewer-hidden" : ""}`}>
        <button
          className="add-child"
          onClick={() => void map.current?.addChild()}
          disabled={!selected || readOnly || working}
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
          disabled={!selected || readOnly || working}
        >
          Cùng cấp <kbd>Enter</kbd>
        </button>
      </div>
      <aside
        className={`starter-card ${readOnly ? "hidden" : ""} ${docs.find((d) => d.id === active)?.data.nodeData.children?.length ? "hidden" : ""}`}
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
          {cloud
            ? readOnly
              ? "Được chia sẻ · Quyền chỉ xem"
              : "Lưu trên cloud · Riêng tư theo tài khoản"
            : "Chế độ khách · Chỉ lưu trên trình duyệt này"}
        </span>
        <div className="view-controls">
          <button
            aria-label="Hoàn tác"
            title="Hoàn tác · ⌘/Ctrl Z"
            disabled={!history.undo || readOnly}
            onClick={() => navigateHistory()}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="Làm lại"
            title="Làm lại · ⌘/Ctrl Shift Z"
            disabled={!history.redo || readOnly}
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
              {cloud
                ? "Không gian riêng và các sơ đồ được chia sẻ với tài khoản Google của bạn."
                : "Lưu riêng trên trình duyệt này. Đăng nhập để lưu trên cloud và chia sẻ."}
            </p>
            <button className="primary-button new-map" onClick={() => create()}>
              <Plus size={17} />
              Tạo sơ đồ mới
            </button>
            {cloud && (
              <button
                className="text-button migrate-local"
                disabled={working}
                onClick={() => void migrateLocal()}
              >
                <Upload size={15} />
                Nhập sơ đồ cũ từ máy này
              </button>
            )}
            <div className="doc-list">
              {docs.map((d) => (
                <button
                  className={d.id === active ? "active" : ""}
                  key={d.id}
                  disabled={working}
                  onClick={() => void switchDoc(d.id)}
                >
                  <FolderOpen size={18} />
                  <span>
                    {d.data.nodeData.topic}
                    <small>
                      {new Date(d.updated).toLocaleDateString("vi-VN")}{" "}
                      {cloud &&
                        ` · ${d.role === "owner" ? "Của tôi" : d.role === "editor" ? "Được sửa" : "Chỉ xem"}`}
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
              Mã nguồn mở.{" "}
              {cloud
                ? "Cloud PostgreSQL · Google Auth"
                : "Chế độ khách trên máy này"}
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
              {cloud
                ? "Sơ đồ lưu trên cloud. Chủ sở hữu có thể chia sẻ quyền xem hoặc sửa qua đúng email Google. Nếu có người lưu trước bạn, ứng dụng giữ bản nháp để tránh ghi đè."
                : "Sơ đồ tự lưu trên trình duyệt. Đăng nhập Google để lưu cloud và chia sẻ. Dùng Xuất JSON để sao lưu."}
            </p>
          </section>
        </div>
      )}
      {cloud && (problem || recovery.length > 0) && (
        <section className="sync-problem" role="alert">
          <div>
            <strong>
              {problem
                ? "Có thay đổi chưa đồng bộ"
                : `Có ${recovery.length} bản nháp cần khôi phục`}
            </strong>
            <p>
              {problem ||
                "Bản nháp từ lần làm việc trước vẫn còn trên máy. Tạo bản sao để giữ lại mà không ghi đè bản cloud."}
            </p>
          </div>
          <button disabled={working} onClick={() => void recoverDrafts()}>
            Giữ nháp thành bản sao
          </button>
          {problem && (
            <>
              <button disabled={working} onClick={() => save.current()}>
                Thử lưu lại
              </button>
              <button
                disabled={working}
                onClick={() => void switchDoc(active, true)}
              >
                Mở bản cloud
              </button>
            </>
          )}
        </section>
      )}
      {sharing && cloud && (
        <ShareDialog
          title={activeDoc.data.nodeData.topic}
          url={`${siteUrl()}?map=${active}`}
          members={members}
          loading={shareLoading}
          busy={shareBusy}
          error={shareError}
          onClose={() => setSharing(false)}
          onGrant={(email, role) => void changeShare(email, role)}
          onRevoke={(id) => void revokeShare(id)}
        />
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
            if (await create(false, clean(JSON.parse(await f.text()))))
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
