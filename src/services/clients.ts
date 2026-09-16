import api from "./api";

export interface ClientRecord {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientInput {
  name: string;
  phone?: string | null;
  note?: string | null;
}

export async function listClients(): Promise<ClientRecord[]> {
  const { data } = await api.get<ClientRecord[]>("/clients");
  return data;
}

export async function createClient(input: ClientInput): Promise<ClientRecord> {
  const { data } = await api.post<ClientRecord>("/clients", input);
  return data;
}

export async function updateClient(
  id: string,
  input: Partial<ClientInput>,
): Promise<ClientRecord> {
  const { data } = await api.put<ClientRecord>(
    `/clients/${encodeURIComponent(id)}`,
    input,
  );
  return data;
}

export async function deleteClient(id: string): Promise<void> {
  await api.delete(`/clients/${encodeURIComponent(id)}`);
}
