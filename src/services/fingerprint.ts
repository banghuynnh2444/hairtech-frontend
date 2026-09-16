import { invoke, isTauri } from '@tauri-apps/api/core';

export async function getDeviceFingerprint(): Promise<string> {
  if (!isTauri()) {
    const developmentFingerprint = import.meta.env.DEV
      ? import.meta.env.VITE_DEV_DEVICE_FINGERPRINT?.trim()
      : '';
    if (developmentFingerprint) return developmentFingerprint;
    throw new Error('Vui lòng mở ứng dụng HairTech desktop để xác định thiết bị và đăng nhập.');
  }
  try {
    const fingerprint = await invoke<string>('get_hardware_id');
    if (!fingerprint?.trim()) throw new Error('Empty machine ID');
    return fingerprint;
  } catch {
    throw new Error('Không đọc được mã định danh máy. Vui lòng khởi động lại ứng dụng.');
  }
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows PC';
  if (ua.includes('Mac')) return 'MacBook';
  return 'Desktop Client';
}
