import { lazy, Suspense, useState, useEffect } from "react";
import "./App.css";
import { Login } from "./components/Login";
import { startHeartbeatWorker, stopHeartbeatWorker } from "./services/license";
import {
  verifyCurrentSession,
  logoutCurrentSession,
  clearHairTechSession,
  hasStoredSession,
} from "./services/session";

const Workspace = lazy(() =>
  import("./components/Workspace").then((module) => ({
    default: module.Workspace,
  })),
);

export function App() {
  const [screen, setScreen] = useState<
    "checking" | "login" | "workspace" | "error"
  >("checking");
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await hasStoredSession())) {
        if (!cancelled) setScreen("login");
        return;
      }
      if (!cancelled) setScreen("checking");
      try {
        await verifyCurrentSession();
        if (!cancelled) setScreen("workspace");
      } catch (err: any) {
        if (cancelled) return;
        setMessage(
          err.response?.data?.message ||
            err.message ||
            "Không thể xác minh tài khoản hoặc license ngoại tuyến.",
        );
        setScreen("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  useEffect(() => {
    if (screen === "workspace") startHeartbeatWorker();
    return () => stopHeartbeatWorker();
  }, [screen]);

  useEffect(() => {
    const denied = (event: Event) => {
      void clearHairTechSession();
      stopHeartbeatWorker();
      setMessage(
        (event as CustomEvent<string>).detail || "Phiên làm việc đã kết thúc.",
      );
      setScreen("error");
    };
    window.addEventListener("hairtech-access-denied", denied);
    return () => window.removeEventListener("hairtech-access-denied", denied);
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    stopHeartbeatWorker();
    try {
      await logoutCurrentSession();
      setScreen("login");
    } catch {
      alert(
        "Chưa thể kết thúc phiên trên máy chủ. Kiểm tra mạng rồi bấm Đăng xuất lại.",
      );
      startHeartbeatWorker();
    } finally {
      setLoggingOut(false);
    }
  };

  if (screen === "checking" || screen === "error")
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h2>HAIRTECH 3D</h2>
          </div>
          <p role="status">
            {screen === "checking"
              ? "Đang kiểm tra tài khoản và gói dịch vụ…"
              : message}
          </p>
          {screen === "error" && (
            <div className="btnrow">
              <button
                className="primary"
                onClick={() => setRetry((value) => value + 1)}
              >
                Thử lại
              </button>
              <button
                onClick={() => {
                  void clearHairTechSession();
                  setScreen("login");
                }}
              >
                Về đăng nhập
              </button>
            </div>
          )}
        </div>
      </div>
    );
  if (screen === "login")
    return <Login onLoginSuccess={() => setScreen("workspace")} />;
  return (
    <Suspense
      fallback={
        <div className="login-container">
          <div className="login-card">
            <p role="status">Đang mở không gian thiết kế…</p>
          </div>
        </div>
      }
    >
      <Workspace onLogout={handleLogout} />
    </Suspense>
  );
}
export default App;
