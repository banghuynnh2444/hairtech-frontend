import api from "./api";

export interface AdminStats {
  totalUsers: number;
  pendingApprovals: number;
  activeSubscribers: number;
  expiredSubscribers: number;
}

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isApproved: boolean;
  createdAt: string;
  subscription: {
    planTier: string | null;
    status: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    isExpired: boolean;
  } | null;
  activeDevice: {
    id: string;
    deviceName: string;
    platform: string;
    deviceFingerprint: string;
    lastSeen: string | null;
  } | null;
}

export interface ListUsersParams {
  search?: string;
  status?: "all" | "pending" | "active" | "expired";
  page?: number;
  limit?: number;
}

export interface ListUsersResponse {
  users: AdminUserItem[];
  total: number;
  page: number;
  limit: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>("/admin/stats");
  return data;
}

export async function listAdminUsers(
  params?: ListUsersParams,
): Promise<ListUsersResponse> {
  const { data } = await api.get<ListUsersResponse>("/admin/users", {
    params,
  });
  return data;
}

export async function approveUser(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/admin/users/${encodeURIComponent(userId)}/approve`);
  return data;
}

export async function revokeUser(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/admin/users/${encodeURIComponent(userId)}/revoke`);
  return data;
}

export async function assignSubscription(
  userId: string,
  planTier: "pro_monthly" | "pro_yearly",
  durationMonths: number,
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(
    `/admin/users/${encodeURIComponent(userId)}/subscription`,
    {
      planTier,
      durationMonths,
    },
  );
  return data;
}

export async function resetUserDevice(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(
    `/admin/users/${encodeURIComponent(userId)}/reset-device`,
  );
  return data;
}

export async function checkIsAdmin(): Promise<boolean> {
  try {
    await getAdminStats();
    return true;
  } catch {
    return false;
  }
}

