import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import MindElixir from "mind-elixir";
import App from "../App";
import { CloudLogin } from "../components/CloudUi";
import {
  cloudConfigured,
  supabase,
  siteUrl,
  CloudRepository,
  errorMessage,
  type Doc,
} from "./repository";
import { theme } from "../model";

export default function CloudRoot() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase),
    [guest, setGuest] = useState(!supabase);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [workspace, setWorkspace] = useState<{
    repo: CloudRepository;
    docs: Doc[];
    active: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error) setError(error.message);
      setSession(data.session);
      setReady(true);
    }).catch((error: unknown) => {
      if (live) { setError(errorMessage(error)); setReady(true); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      if (live) {
        setSession(value);
        setReady(true);
      }
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session || !supabase) {
      // eslint-disable-next-line react/set-state-in-effect -- Clear the previous authenticated workspace when its external session ends.
      setWorkspace(null);
      return;
    }
    let live = true;
    const repo = new CloudRepository(supabase, session.user);
    // eslint-disable-next-line react/set-state-in-effect -- Loading state follows the external authenticated account.
    setBusy(true);
    setError("");
    void (async () => {
      await repo.claim();
      let docs = await repo.list();
      repo.preserveDrafts();
      const wanted =
        new URLSearchParams(location.search).get("map") ||
        sessionStorage.getItem("sprig-open-map");
      if (wanted && !/^[\da-f-]{36}$/i.test(wanted))
        throw Error("Đường dẫn sơ đồ không hợp lệ.");
      if (wanted && !docs.some((d) => d.id === wanted)) {
        const shared = await repo.get(wanted);
        docs = [shared, ...docs];
      }
      if (!docs.length) {
        const data = MindElixir.new("Ý tưởng của bạn");
        data.theme = theme;
        docs = [await repo.create(data)];
      }
      sessionStorage.removeItem("sprig-open-map");
      if (live) setWorkspace({ repo, docs, active: wanted || docs[0].id });
    })()
      .catch((e) => {
        if (live) setError(errorMessage(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  // A refreshed access token must not recreate the editor and discard its active editing state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, attempt]);
  async function login() {
    if (!supabase) {
      setGuest(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const wanted = new URLSearchParams(location.search).get("map");
      if (wanted) sessionStorage.setItem("sprig-open-map", wanted);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: siteUrl(),
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  async function logout() {
    if (!supabase) return;
    try {
      await workspace?.repo.flush();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      setWorkspace(null);
      setGuest(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (guest) return <App key="guest" onLogin={() => setGuest(false)} />;
  if (!ready)
    return <div className="cloud-progress">Đang kiểm tra đăng nhập…</div>;
  if (!session)
    return (
      <CloudLogin
        configured={cloudConfigured}
        busy={busy}
        error={error}
        onLogin={() => void login()}
        onGuest={() => setGuest(true)}
      />
    );
  if (!workspace || workspace.repo.user.id !== session.user.id)
    return (
      <div className="cloud-progress">
        <h2>
          {busy
            ? "Đang mở không gian của bạn…"
            : "Chưa mở được không gian cloud"}
        </h2>
        {error && <p role="alert">{error}</p>}
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => setAttempt((n) => n + 1)}
        >
          Thử lại
        </button>
        <button
          onClick={() => {
            const url = new URL(location.href);
            url.searchParams.delete("map");
            history.replaceState(null, "", url);
            sessionStorage.removeItem("sprig-open-map");
            setAttempt((n) => n + 1);
          }}
        >
          Mở sơ đồ của tôi
        </button>
        <button onClick={() => void logout()}>Đăng xuất</button>
      </div>
    );
  return (
    <>
      <App
        key={session.user.id}
        cloud={workspace.repo}
        initialDocs={workspace.docs}
        initialActive={workspace.active}
        onLogout={() => void logout()}
      />
      {error && (
        <div className="cloud-account-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Đóng</button>
        </div>
      )}
    </>
  );
}
