import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  FolderKey,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Pencil,
  ShieldCheck,
  Sprout,
  Trash2,
  UserRoundPlus,
  X,
} from "lucide-react";
import "./CloudUi.css";

type Role = "viewer" | "editor";
type ShareMember = {
  id: string;
  invite_email: string;
  role: Role;
  recipient_id: string | null;
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.91c-.58 2.96-2.25 5.47-4.73 7.16l7.64 5.93c4.46-4.14 7.16-10.24 7.16-17.56Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.79l-7.64-5.93c-2.13 1.44-4.86 2.3-8.27 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}

export type CloudLoginProps = {
  configured: boolean;
  busy: boolean;
  error: string;
  onLogin: () => void;
  onGuest: () => void;
};

export function CloudLogin({
  configured,
  busy,
  error,
  onLogin,
  onGuest,
}: CloudLoginProps) {
  return (
    <main className="cloud-login-page">
      <section className="cloud-login-card" aria-labelledby="cloud-login-title">
        <div className="cloud-login-brand">
          <span className="cloud-brand-mark">
            <Sprout size={24} />
          </span>
          <span>sprig</span>
          <span className="cloud-brand-beta">BETA</span>
        </div>
        <div className="cloud-login-icon">
          <FolderKey size={25} />
        </div>
        <p className="cloud-eyebrow">KHÔNG GIAN CỦA BẠN</p>
        <h1 id="cloud-login-title">
          Ý tưởng của bạn,
          <br />ở bất cứ đâu.
        </h1>
        <p className="cloud-login-description">
          Lưu sơ đồ an toàn trên đám mây. Đăng nhập để dùng nhiều thiết bị và
          chia sẻ với cộng tác viên.
        </p>
        {configured ? (
          <button
            className="cloud-google-button"
            onClick={onLogin}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle size={19} className="cloud-spinner" />
            ) : (
              <GoogleMark />
            )}
            {busy ? "Đang kết nối với Google…" : "Tiếp tục với Google"}
          </button>
        ) : (
          <div className="cloud-setup-card">
            <div className="cloud-setup-icon">
              <ShieldCheck size={18} />
            </div>
            <div>
              <strong>Đang chuẩn bị kết nối đám mây</strong>
              <p>
                Cần cấu hình project Supabase và Google OAuth trước lần đăng
                nhập đầu tiên.
              </p>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                Mở Supabase Dashboard <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}
        {error && (
          <p className="cloud-error" role="alert">
            {error}
          </p>
        )}
        <button className="cloud-guest-button" onClick={onGuest}>
          Tiếp tục không đăng nhập
        </button>
        <div className="cloud-login-footnote">
          <LockKeyhole size={13} />
          Sơ đồ riêng tư; bạn quyết định chia sẻ với ai.
        </div>
      </section>
    </main>
  );
}

export type ShareDialogProps = {
  title: string;
  url: string;
  members: ShareMember[];
  loading: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onGrant: (email: string, role: Role) => void;
  onRevoke: (id: string) => void;
};

export function ShareDialog({
  title,
  url,
  members,
  loading,
  busy,
  error,
  onClose,
  onGrant,
  onRevoke,
}: ShareDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const closeLatest = useRef(onClose);
  useEffect(() => {
    closeLatest.current = onClose;
  }, [onClose]);

  useEffect(() => {
    restoreFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => emailRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLatest.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".cloud-share-dialog");
      if (!dialog) return;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
        ),
      ];
      if (!items.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      restoreFocus.current?.focus();
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    onGrant(normalized, role);
    setEmail("");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  return (
    <div
      className="cloud-share-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="cloud-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-share-title"
      >
        <button
          className="cloud-dialog-close"
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          disabled={busy}
        >
          <X size={19} />
        </button>
        <div className="cloud-dialog-icon">
          <UserRoundPlus size={21} />
        </div>
        <p className="cloud-eyebrow">CỘNG TÁC CÙNG NHAU</p>
        <h2 id="cloud-share-title">Chia sẻ sơ đồ</h2>
        <p className="cloud-share-map-title">{title || "Sơ đồ chưa đặt tên"}</p>
        <p className="cloud-share-explainer">
          Mời người khác bằng email Google của họ. Chỉ người được mời mới có thể
          mở sơ đồ.
        </p>

        <form className="cloud-invite-form" onSubmit={submit}>
          <label htmlFor="cloud-invite-email">Email Google</label>
          <div className="cloud-invite-row">
            <div className="cloud-email-input">
              <Mail size={16} />
              <input
                ref={emailRef}
                id="cloud-invite-email"
                type="email"
                autoComplete="email"
                placeholder="ten@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={busy}
              />
            </div>
            <label
              className="cloud-visually-hidden"
              htmlFor="cloud-invite-role"
            >
              Quyền truy cập
            </label>
            <select
              id="cloud-invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              disabled={busy}
            >
              <option value="viewer">Chỉ xem</option>
              <option value="editor">Có thể sửa</option>
            </select>
            <button
              className="cloud-invite-button"
              type="submit"
              disabled={busy || !email.trim()}
              aria-label="Gửi lời mời"
            >
              {busy ? (
                <LoaderCircle size={17} className="cloud-spinner" />
              ) : (
                <UserRoundPlus size={17} />
              )}
              <span>Mời</span>
            </button>
          </div>
          <p className="cloud-role-hint">
            {role === "viewer" ? (
              <>
                <Eye size={13} /> Chỉ xem sơ đồ, không thể thay đổi.
              </>
            ) : (
              <>
                <Pencil size={13} /> Được chỉnh sửa và lưu thay đổi.
              </>
            )}
          </p>
        </form>

        <div className="cloud-members-heading">
          <span>ĐÃ CẤP QUYỀN</span>
          <span>{loading ? "…" : members.length}</span>
        </div>
        {loading ? (
          <div className="cloud-members-loading">
            <LoaderCircle size={17} className="cloud-spinner" />
            Đang tải danh sách…
          </div>
        ) : members.length === 0 ? (
          <div className="cloud-members-empty">
            <Mail size={19} />
            <span>Chưa chia sẻ với ai. Sơ đồ chỉ bạn mới xem được.</span>
          </div>
        ) : (
          <ul className="cloud-members-list">
            {members.map((member) => (
              <li key={member.id}>
                <span className="cloud-member-avatar">
                  {member.invite_email.slice(0, 1).toUpperCase()}
                </span>
                <span className="cloud-member-email">
                  {member.invite_email}
                  <small>
                    {member.recipient_id
                      ? "Đã tham gia"
                      : "Đang chờ đăng nhập lần đầu"}
                  </small>
                </span>
                <label
                  className="cloud-visually-hidden"
                  htmlFor={`role-${member.id}`}
                >
                  Quyền của {member.invite_email}
                </label>
                <select
                  id={`role-${member.id}`}
                  className="cloud-member-role"
                  value={member.role}
                  disabled={busy}
                  onChange={(event) =>
                    onGrant(member.invite_email, event.target.value as Role)
                  }
                >
                  <option value="viewer">Chỉ xem</option>
                  <option value="editor">Có thể sửa</option>
                </select>
                <button
                  className="cloud-revoke-button"
                  type="button"
                  title={`Thu hồi quyền của ${member.invite_email}`}
                  aria-label={`Thu hồi quyền của ${member.invite_email}`}
                  onClick={() => onRevoke(member.id)}
                  disabled={busy}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="cloud-error cloud-share-error" role="alert">
            {error}
          </p>
        )}

        <div className="cloud-link-note">
          <LockKeyhole size={15} />
          <span>
            Đường dẫn không tự cấp quyền. Người nhận cần đăng nhập đúng email đã
            mời.
          </span>
        </div>
        <div className="cloud-share-footer">
          <button
            className="cloud-copy-button"
            type="button"
            onClick={() => void copyLink()}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Đã sao chép" : "Sao chép đường dẫn"}
          </button>
          <button
            className="cloud-done-button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Xong
          </button>
        </div>
        <span className="cloud-copy-status" aria-live="polite">
          {copied
            ? "Đã sao chép đường dẫn vào clipboard."
            : copyError
              ? "Trình duyệt không cho phép sao chép đường dẫn."
              : ""}
        </span>
      </section>
    </div>
  );
}
