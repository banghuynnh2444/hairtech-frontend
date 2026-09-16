import React, { useState } from 'react';
import api from '../services/api';
import { getDeviceFingerprint, getDeviceName } from '../services/fingerprint';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { Lock, Mail, Store, ShieldAlert, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import { clearStoredSession, storeAuthTokens } from '../services/secure-session';
import { refreshOfflineLicense } from '../services/license';

interface LoginProps {
  onLoginSuccess: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [salonName, setSalonName] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const resetState = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const deviceFingerprint = await getDeviceFingerprint();
        const deviceName = getDeviceName();

        const res = await api.post('/auth/login', {
          email,
          password,
          deviceFingerprint,
          deviceName,
          platform: navigator.userAgent.includes('Windows') ? 'windows' : 'macos',
          clientVersion: isTauri() ? await getVersion() : '0.2.0-browser-dev',
        });

        await storeAuthTokens(res.data.accessToken, res.data.refreshToken);
        try {
          await refreshOfflineLicense();
        } catch (licenseError) {
          await clearStoredSession();
          throw licenseError;
        }
        onLoginSuccess();
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          setErrorMessage('Mật khẩu xác nhận không khớp!');
          setLoading(false);
          return;
        }

        const res = await api.post('/auth/register', {
          email,
          password,
          salonName,
        });

        setSuccessMessage(res.data.message || 'Đã đăng ký. Vui lòng chờ quản trị viên duyệt và cấp gói dịch vụ.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else if (mode === 'forgot') {
        const res = await api.post('/auth/forgot-password', { email });
        setSuccessMessage(res.data.message || 'Đã gửi liên kết khôi phục vào email của bạn.');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message
        || (typeof err === 'string' ? err : undefined)
        || (!err.isAxiosError && err.message)
        || 'Có lỗi xảy ra, vui lòng kiểm tra lại kết nối máy chủ.';
      setErrorMessage(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>HAIRTECH 3D</h2>
          <p>
            {mode === 'login' && 'Hệ thống Quản lý Salon & Sơ đồ Cắt uốn Kỹ thuật số'}
            {mode === 'register' && 'Đăng ký tài khoản · Cần được duyệt và có gói dịch vụ'}
            {mode === 'forgot' && 'Khôi phục mật khẩu tài khoản'}
          </p>
        </div>

        {errorMessage && (
          <div className="error-banner">
            <ShieldAlert size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="success-banner">
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'register' && (
            <div className="input-group">
              <label>Tên Salon / Stylist</label>
              <div className="input-wrapper">
                <Store size={18} className="input-icon" />
                <input
                  type="text"
                  placeholder="Hair Salon Tokyo"
                  value={salonName}
                  onChange={(e) => setSalonName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="input-group">
            <label>Địa chỉ Email</label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                placeholder="stylist@hairtech.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div className="input-group">
              <div className="label-row">
                <label>Mật khẩu</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => resetState('forgot')}
                  >
                    Quên mật khẩu?
                  </button>
                )}
              </div>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  placeholder="••••••••"
                  minLength={mode === 'register' ? 8 : 1}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="input-group">
              <label>Nhập lại mật khẩu</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  placeholder="••••••••"
                  minLength={8}
                  maxLength={72}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-submit">
            {loading ? (
              <>
                <Loader2 size={18} className="spinner" />
                Đang xử lý...
              </>
            ) : mode === 'login' ? (
              'Đăng nhập thiết bị'
            ) : mode === 'register' ? (
              'Gửi yêu cầu đăng ký'
            ) : (
              'Gửi liên kết khôi phục'
            )}
          </button>
        </form>

        <div className="auth-switch-footer">
          {mode === 'login' ? (
            <p>
              Chưa có tài khoản?{' '}
              <button
                type="button"
                className="btn-link-highlight"
                onClick={() => resetState('register')}
              >
                Đăng ký ngay
              </button>
            </p>
          ) : (
            <button
              type="button"
              className="btn-back-login"
              onClick={() => resetState('login')}
            >
              <ArrowLeft size={16} /> Quay lại đăng nhập
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
