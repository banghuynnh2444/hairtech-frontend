import api from './api';
import { getDeviceFingerprint } from './fingerprint';
import { clearStoredSession, getSessionTokens, verifyOfflineLicense } from './secure-session';

export async function clearHairTechSession() {
  await clearStoredSession();
}

export async function hasStoredSession(): Promise<boolean> {
  return Boolean(await getSessionTokens());
}

export async function verifyCurrentSession(): Promise<'online' | 'offline'> {
  const deviceFingerprint = await getDeviceFingerprint();
  try {
    const { data } = await api.post('/auth/session', { deviceFingerprint });
    if (data?.valid !== true) throw new Error('Không xác minh được quyền sử dụng tài khoản.');
    return 'online';
  } catch (error: any) {
    if (error.response) throw error;
    await verifyOfflineLicense();
    return 'offline';
  }
}

export async function logoutCurrentSession() {
  await api.post('/auth/logout');
  await clearHairTechSession();
}
