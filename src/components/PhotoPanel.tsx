import { useEffect, useMemo, useState } from "react";
import type { ClientRecord } from "../services/clients";
import {
  deleteClientPhoto,
  listClientPhotos,
  uploadClientPhoto,
  type ClientPhoto,
  type ClientPhotoKind,
} from "../services/photos";

interface PhotoPanelProps {
  client: ClientRecord | null;
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return "Không thể xử lý ảnh. Vui lòng thử lại.";
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadButton({
  kind,
  label,
  disabled,
  onFile,
}: {
  kind: ClientPhotoKind;
  label: string;
  disabled: boolean;
  onFile: (kind: ClientPhotoKind, file: File) => void;
}) {
  return (
    <label className={`photo-upload-button ${disabled ? "disabled" : ""}`}>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(kind, file);
        }}
      />
      {label}
    </label>
  );
}

function PhotoCard({
  photo,
  title,
  busy,
  onDelete,
  onReplace,
}: {
  photo: ClientPhoto;
  title: string;
  busy: boolean;
  onDelete: (photo: ClientPhoto) => void;
  onReplace?: (kind: ClientPhotoKind, file: File) => void;
}) {
  return (
    <article className="customer-photo-card">
      <div className="customer-photo-frame">
        <img src={photo.url} alt={`${title} của khách hàng`} loading="lazy" />
        <span>{title}</span>
      </div>
      <div className="customer-photo-meta">
        <strong title={photo.original_name}>{photo.original_name}</strong>
        <small>{formatSize(photo.size_bytes)}</small>
      </div>
      <div className="customer-photo-actions">
        {onReplace && (
          <UploadButton
            kind={photo.kind}
            label="Thay ảnh"
            disabled={busy}
            onFile={onReplace}
          />
        )}
        <button
          type="button"
          className="danger-text"
          disabled={busy}
          onClick={() => onDelete(photo)}
        >
          Xóa
        </button>
      </div>
    </article>
  );
}

export function PhotoPanel({ client }: PhotoPanelProps) {
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadingKind, setUploadingKind] = useState<ClientPhotoKind | null>(null);
  const [progress, setProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!client) {
      setPhotos([]);
      setError("");
      return;
    }
    const load = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const result = await listClientPhotos(client.id);
        if (!cancelled) {
          setPhotos(result);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };
    void load(true);
    timer = setInterval(() => void load(false), 10 * 60_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [client?.id]);

  const before = photos.find((photo) => photo.kind === "before") ?? null;
  const after = photos.find((photo) => photo.kind === "after") ?? null;
  const references = useMemo(
    () => photos.filter((photo) => photo.kind === "reference"),
    [photos],
  );
  const busy = uploadingKind !== null || deletingId !== null;

  const upload = async (kind: ClientPhotoKind, file: File) => {
    if (!client || busy) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
      return;
    }
    if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
      setError("Ảnh phải nhỏ hơn hoặc bằng 8 MB.");
      return;
    }
    setUploadingKind(kind);
    setProgress(0);
    setError("");
    try {
      const saved = await uploadClientPhoto(client.id, kind, file, setProgress);
      setPhotos((current) => kind === "reference"
        ? [saved, ...current]
        : [saved, ...current.filter((photo) => photo.kind !== kind)]);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploadingKind(null);
      setProgress(0);
    }
  };

  const remove = async (photo: ClientPhoto) => {
    if (!client || busy || !confirm(`Xóa ảnh “${photo.original_name}”?`)) return;
    setDeletingId(photo.id);
    setError("");
    try {
      await deleteClientPhoto(client.id, photo.id);
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeletingId(null);
    }
  };

  if (!client) {
    return (
      <div className="photo-empty-hero">
        <span>▧</span>
        <h2>Chọn khách hàng trước</h2>
        <p>Vào tab Khách hàng, chọn một hồ sơ rồi quay lại đây để quản lý ảnh.</p>
      </div>
    );
  }

  return (
    <div className="photo-workspace">
      <div className="photo-heading">
        <div>
          <span className="eyebrow">Kho ảnh riêng tư</span>
          <h2>{client.name}</h2>
          <p>JPEG, PNG hoặc WebP · tối đa 8 MB mỗi ảnh</p>
        </div>
        {uploadingKind && (
          <div className="photo-progress" role="status">
            <span>Đang tải {progress}%</span>
            <i style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {loading ? (
        <p className="empty-state">Đang tải ảnh khách hàng…</p>
      ) : (
        <>
          <section className="primary-photo-grid" aria-label="Ảnh trước và sau">
            {(["before", "after"] as const).map((kind) => {
              const photo = kind === "before" ? before : after;
              const title = kind === "before" ? "Ảnh trước" : "Ảnh sau";
              return photo ? (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  title={title}
                  busy={busy}
                  onDelete={(item) => void remove(item)}
                  onReplace={(nextKind, file) => void upload(nextKind, file)}
                />
              ) : (
                <div className="photo-slot-empty" key={kind}>
                  <span>{kind === "before" ? "◐" : "◑"}</span>
                  <strong>{title}</strong>
                  <small>Chưa có ảnh</small>
                  <UploadButton
                    kind={kind}
                    label="Chọn ảnh"
                    disabled={busy}
                    onFile={(nextKind, file) => void upload(nextKind, file)}
                  />
                </div>
              );
            })}
          </section>

          <section className="reference-photo-section">
            <div className="reference-photo-heading">
              <div>
                <span className="eyebrow">Thư viện</span>
                <h3>Ảnh tham khảo</h3>
              </div>
              <UploadButton
                kind="reference"
                label="+ Thêm ảnh"
                disabled={busy}
                onFile={(kind, file) => void upload(kind, file)}
              />
            </div>
            {references.length === 0 ? (
              <p className="empty-state">Chưa có ảnh tham khảo.</p>
            ) : (
              <div className="reference-photo-grid">
                {references.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    title="Tham khảo"
                    busy={busy}
                    onDelete={(item) => void remove(item)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {error && <p className="panel-error" role="alert">{error}</p>}
    </div>
  );
}
