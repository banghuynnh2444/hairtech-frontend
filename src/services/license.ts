import api from './api';
import { getDeviceFingerprint } from './fingerprint';
import { getSessionTokens, storeOfflineLicense, verifyOfflineLicense } from './secure-session';

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function denyAccess(message: string) {
  window.dispatchEvent(new CustomEvent('hairtech-access-denied', { detail: message }));
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Không xác minh được license ngoại tuyến.';
}

export async function refreshOfflineLicense() {
  const session = await getSessionTokens();
  if (!session) throw new Error('Không còn phiên đăng nhập để cấp license.');
  const deviceFingerprint = await getDeviceFingerprint();
  const response = await api.post('/license/heartbeat', { deviceFingerprint });
  if (typeof response.data?.offlineLicense !== 'string') {
    throw new Error('Máy chủ không trả về offline license.');
  }
  await storeOfflineLicense(response.data.offlineLicense);
}

export async function sendHeartbeat() {
  try {
    await refreshOfflineLicense();
  } catch (error: any) {
    if (error?.response) return;
    if (!error?.isAxiosError) {
      denyAccess(errorMessage(error));
      return;
    }
    try {
      await verifyOfflineLicense();
    } catch (licenseError: unknown) {
      denyAccess(errorMessage(licenseError));
    }
  }
}

export function startHeartbeatWorker() {
  stopHeartbeatWorker();
  void sendHeartbeat();
  heartbeatTimer = setInterval(() => { void sendHeartbeat(); }, 60000);
}

export function stopHeartbeatWorker() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
