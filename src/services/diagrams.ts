import api from "./api";
import type { ProjectDataV1 } from "./project";

export interface DiagramSummary {
  id: string;
  user_id: string;
  client_id: string | null;
  type: string;
  name: string;
  notes: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagramDetail extends DiagramSummary {
  project_data: ProjectDataV1;
}

export interface CreateDiagramInput {
  client_id: string | null;
  type: string;
  name: string;
  notes?: string | null;
  thumbnail_url?: string | null;
  project_data: ProjectDataV1;
}

export async function listClientDiagrams(
  clientId: string,
): Promise<DiagramSummary[]> {
  const { data } = await api.get<DiagramSummary[]>(
    `/diagrams/client/${encodeURIComponent(clientId)}`,
  );
  return data;
}

export async function getDiagram(id: string): Promise<DiagramDetail> {
  const { data } = await api.get<DiagramDetail>(
    `/diagrams/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function createDiagram(
  input: CreateDiagramInput,
): Promise<DiagramDetail> {
  const { data } = await api.post<DiagramDetail>("/diagrams", input);
  return data;
}

export async function updateDiagram(
  id: string,
  input: Partial<Omit<CreateDiagramInput, "client_id">> & {
    client_id?: string | null;
  },
): Promise<DiagramDetail> {
  const { data } = await api.put<DiagramDetail>(
    `/diagrams/${encodeURIComponent(id)}`,
    input,
  );
  return data;
}

export async function deleteDiagram(id: string): Promise<void> {
  await api.delete(`/diagrams/${encodeURIComponent(id)}`);
}
