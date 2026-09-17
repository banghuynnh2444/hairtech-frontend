import api from "./api";

export type ClientPhotoKind = "before" | "after" | "reference";

export interface ClientPhoto {
  id: string;
  user_id: string;
  client_id: string;
  kind: ClientPhotoKind;
  storage_path: string;
  original_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  created_at: string;
  updated_at: string;
  url: string;
  url_expires_at: string;
}

export async function listClientPhotos(clientId: string): Promise<ClientPhoto[]> {
  const { data } = await api.get<ClientPhoto[]>(
    `/clients/${encodeURIComponent(clientId)}/photos`,
  );
  return data;
}

export async function uploadClientPhoto(
  clientId: string,
  kind: ClientPhotoKind,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ClientPhoto> {
  const form = new FormData();
  form.append("file", file, file.name);
  const { data } = await api.post<ClientPhoto>(
    `/clients/${encodeURIComponent(clientId)}/photos/${kind}`,
    form,
    {
      timeout: 60_000,
      onUploadProgress: (event) => {
        if (!event.total || !onProgress) return;
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    },
  );
  return data;
}

export async function deleteClientPhoto(
  clientId: string,
  photoId: string,
): Promise<void> {
  await api.delete(
    `/clients/${encodeURIComponent(clientId)}/photos/${encodeURIComponent(photoId)}`,
  );
}
