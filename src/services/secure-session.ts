import { invoke, isTauri } from '@tauri-apps/api/core';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface OfflineLicenseStatus {
  version: number;
  sub: string;
  deviceId: string;
  fp: string;
  issuedAt: number;
  validUntil: number;
  subscriptionExpiresAt: number;
}

let browserSession: SessionTokens | null = null;

if (typeof localStorage !== 'undefined') {
  for (const key of ['hairtech_access_token', 'hairtech_offline_license', 'hairtech_license_expires_at']) {
    localStorage.removeItem(key);
  }
}

export async function getSessionTokens(): Promise<SessionTokens | null> {
  if (!isTauri()) return browserSession;
  return invoke<SessionTokens | null>('get_session_tokens');
}

export async function storeAuthTokens(accessToken: string, refreshToken: string): Promise<void> {
  if (!accessToken || !refreshToken) throw new Error('Máy chủ không trả về đầy đủ token phiên.');
  if (!isTauri()) {
    browserSession = { accessToken, refreshToken };
    return;
  }
  await invoke('store_auth_session', { accessToken, refreshToken });
}

export async function updateAccessToken(accessToken: string): Promise<void> {
  const session = await getSessionTokens();
  if (!session) throw new Error('Không còn phiên đăng nhập để làm mới.');
  await storeAuthTokens(accessToken, session.refreshToken);
}

export async function storeOfflineLicense(offlineLicense: string): Promise<void> {
  if (!isTauri()) return;
  await invoke('store_offline_license', { offlineLicense });
}

export async function verifyOfflineLicense(): Promise<OfflineLicenseStatus> {
  if (!isTauri()) throw new Error('Chỉ ứng dụng desktop mới hỗ trợ chế độ ngoại tuyến.');
  return invoke<OfflineLicenseStatus>('verify_offline_license');
}

export async function clearStoredSession(): Promise<void> {
  browserSession = null;
  if (isTauri()) await invoke('clear_auth_session');
}
