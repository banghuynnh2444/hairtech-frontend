import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percent: number;
  status: "idle" | "downloading" | "installing" | "ready" | "error";
  error?: string;
}

export async function checkForAppUpdate(): Promise<Update | null> {
  try {
    const update = await check();
    return update;
  } catch (err) {
    console.warn("Auto-update check skipped or failed:", err);
    return null;
  }
}

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  try {
    let downloaded = 0;
    let total = 0;

    onProgress({
      downloaded: 0,
      total: 0,
      percent: 0,
      status: "downloading",
    });

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          onProgress({
            downloaded: 0,
            total,
            percent: 0,
            status: "downloading",
          });
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
          onProgress({
            downloaded,
            total,
            percent,
            status: "downloading",
          });
          break;
        case "Finished":
          onProgress({
            downloaded: total,
            total,
            percent: 100,
            status: "installing",
          });
          break;
      }
    });

    onProgress({
      downloaded: total,
      total,
      percent: 100,
      status: "ready",
    });

    // Short pause so user sees 100% before relaunching
    await new Promise((r) => setTimeout(r, 800));
    await relaunch();
  } catch (err: any) {
    console.error("Failed to install update:", err);
    onProgress({
      downloaded: 0,
      total: 0,
      percent: 0,
      status: "error",
      error: err?.message || "Lỗi tải bản cập nhật.",
    });
    throw err;
  }
}
