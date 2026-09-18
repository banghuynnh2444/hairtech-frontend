import axios from 'axios';
import { getDeviceFingerprint } from './fingerprint';
import { getSessionTokens, updateAccessToken } from './secure-session';

const apiUrl = import.meta.env.VITE_API_URL?.trim() || (import.meta.env.DEV ? 'http://localhost:3000' : '');
if (!apiUrl) throw new Error('Thiếu VITE_API_URL khi build bản phát hành.');

const api = axios.create({
  baseURL: apiUrl,
  timeout: 30000,
});

let refreshPromise: Promise<string> | null = null;

function notifyAccessDenied(message?: string) {
  window.dispatchEvent(new CustomEvent('hairtech-access-denied', {
    detail: message || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
  }));
}

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const session = await getSessionTokens();
    if (!session?.refreshToken) throw new Error('Không còn refresh token.');
    const deviceFingerprint = await getDeviceFingerprint();
    const response = await axios.post(`${apiUrl}/auth/refresh`, { deviceFingerprint }, {
      timeout: 10000,
      headers: { Authorization: `Bearer ${session.refreshToken}` },
    });
    const accessToken = response.data?.accessToken;
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('Máy chủ không trả về access token mới.');
    await updateAccessToken(accessToken);
    return accessToken;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  const session = await getSessionTokens();
  if (session?.accessToken) config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const errorData = error.response?.data;
    const errorCode = errorData?.code;
    const url = error.config?.url || '';
    const authForm = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/logout', '/auth/refresh']
      .some(path => url.endsWith(path));
    const request = error.config as (typeof error.config & { _hairtechRetried?: boolean }) | undefined;

    if (error.response?.status === 401 && !authForm && request && !request._hairtechRetried) {
      request._hairtechRetried = true;
      try {
        const accessToken = await refreshAccessToken();
        request.headers.Authorization = `Bearer ${accessToken}`;
        return api.request(request);
      } catch (refreshError: any) {
        if (refreshError.response) {
          notifyAccessDenied(refreshError.response.data?.message);
        }
        return Promise.reject(refreshError);
      }
    }

    const deniedCodes = ['ACCOUNT_NOT_APPROVED', 'PROFILE_NOT_FOUND', 'NO_SUBSCRIPTION',
      'PAID_PLAN_REQUIRED', 'SUBSCRIPTION_INACTIVE', 'SUBSCRIPTION_EXPIRED', 'SUBSCRIPTION_NOT_STARTED',
      'DEVICE_NOT_ACTIVE', 'SESSION_TERMINATED'];
    if (!authForm && (deniedCodes.includes(errorCode) || error.response?.status === 401)) {
      notifyAccessDenied(errorData?.message);
    }

    return Promise.reject(error);
  },
);

export default api;
