// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SESSION_DIRECTORY: &str = "com.hairtech.app";
const SESSION_FILENAME: &str = "session.dat";
const MAX_SESSION_FILE_BYTES: usize = 64 * 1024;
const LICENSE_PUBLIC_KEY: &str = "_IV498kM7I51su3yaIyqIgQSwLXhH6q1Y27tTdiad9Y";
const MAX_OFFLINE_SECONDS: i64 = 72 * 60 * 60;

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    access_token: String,
    refresh_token: String,
    offline_license: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionTokens {
    access_token: String,
    refresh_token: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct OfflineLicensePayload {
    version: u8,
    sub: String,
    device_id: String,
    fp: String,
    issued_at: i64,
    valid_until: i64,
    subscription_expires_at: i64,
    nonce: String,
}

fn session_path() -> Result<PathBuf, String> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .ok_or("Không tìm thấy thư mục dữ liệu riêng của Windows.".to_string())?;
    Ok(PathBuf::from(local_app_data)
        .join(SESSION_DIRECTORY)
        .join(SESSION_FILENAME))
}

#[cfg(target_os = "windows")]
fn protect_session_data(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let plaintext_len = u32::try_from(plaintext.len())
        .map_err(|_| "Dữ liệu phiên vượt quá giới hạn an toàn.".to_string())?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: plaintext_len,
        pbData: plaintext.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    let success = unsafe {
        CryptProtectData(
            &input,
            null(),
            null(),
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if success == 0 {
        return Err(format!(
            "Windows không mã hóa được phiên: {}",
            std::io::Error::last_os_error()
        ));
    }

    let encrypted = unsafe {
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(output.pbData.cast());
        bytes
    };
    Ok(encrypted)
}

#[cfg(target_os = "windows")]
fn unprotect_session_data(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let ciphertext_len = u32::try_from(ciphertext.len())
        .map_err(|_| "Dữ liệu phiên vượt quá giới hạn an toàn.".to_string())?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: ciphertext_len,
        pbData: ciphertext.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    let success = unsafe {
        CryptUnprotectData(
            &input,
            null_mut(),
            null(),
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if success == 0 {
        return Err(format!(
            "Windows không giải mã được phiên: {}",
            std::io::Error::last_os_error()
        ));
    }

    let plaintext = unsafe {
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(output.pbData.cast());
        bytes
    };
    Ok(plaintext)
}

#[cfg(not(target_os = "windows"))]
fn protect_session_data(_plaintext: &[u8]) -> Result<Vec<u8>, String> {
    Err("Kho phiên an toàn hiện chỉ hỗ trợ Windows.".to_string())
}

#[cfg(not(target_os = "windows"))]
fn unprotect_session_data(_ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    Err("Kho phiên an toàn hiện chỉ hỗ trợ Windows.".to_string())
}

fn load_session() -> Result<StoredSession, String> {
    let encrypted = match fs::read(session_path()?) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(StoredSession::default())
        }
        Err(error) => return Err(format!("Không đọc được kho phiên an toàn: {error}")),
    };
    if encrypted.is_empty() || encrypted.len() > MAX_SESSION_FILE_BYTES {
        return Err("Dữ liệu phiên trong kho an toàn bị hỏng.".to_string());
    }
    let serialized = unprotect_session_data(&encrypted)?;
    serde_json::from_slice(&serialized)
        .map_err(|_| "Dữ liệu phiên trong kho an toàn bị hỏng.".to_string())
}

fn save_session(session: &StoredSession) -> Result<(), String> {
    let serialized = serde_json::to_string(session)
        .map_err(|_| "Không thể chuẩn bị dữ liệu phiên.".to_string())?;
    let encrypted = protect_session_data(serialized.as_bytes())?;
    let path = session_path()?;
    let parent = path
        .parent()
        .ok_or("Đường dẫn kho phiên không hợp lệ.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("Không tạo được kho phiên: {error}"))?;
    fs::write(path, encrypted).map_err(|error| format!("Không lưu được phiên an toàn: {error}"))
}

fn unix_now() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|_| "Đồng hồ hệ thống không hợp lệ.".to_string())
}

fn verify_offline_license_with_key(
    license: &str,
    expected_fingerprint: &str,
    now: i64,
    public_key: &[u8; 32],
) -> Result<OfflineLicensePayload, String> {
    let mut parts = license.split('.');
    let encoded_payload = parts.next().ok_or("License ngoại tuyến không hợp lệ.")?;
    let encoded_signature = parts.next().ok_or("License ngoại tuyến không hợp lệ.")?;
    if parts.next().is_some() {
        return Err("License ngoại tuyến không hợp lệ.".to_string());
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(encoded_payload)
        .map_err(|_| "License ngoại tuyến không hợp lệ.".to_string())?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(encoded_signature)
        .map_err(|_| "Chữ ký license không hợp lệ.".to_string())?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Chữ ký license không hợp lệ.".to_string())?;
    let verifying_key = VerifyingKey::from_bytes(public_key)
        .map_err(|_| "Public key của ứng dụng không hợp lệ.".to_string())?;
    verifying_key
        .verify(&payload_bytes, &signature)
        .map_err(|_| "License đã bị thay đổi hoặc không do HairTech phát hành.".to_string())?;

    let payload: OfflineLicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|_| "Nội dung license không hợp lệ.".to_string())?;
    if payload.version != 1
        || payload.sub.trim().is_empty()
        || payload.device_id.trim().is_empty()
        || payload.nonce.trim().is_empty()
        || payload.fp != expected_fingerprint
    {
        return Err("License không thuộc tài khoản hoặc thiết bị này.".to_string());
    }
    if payload.issued_at > now + 300
        || payload.valid_until <= now
        || payload.subscription_expires_at <= now
        || payload.valid_until > payload.subscription_expires_at
        || payload.valid_until < payload.issued_at
        || payload.valid_until - payload.issued_at > MAX_OFFLINE_SECONDS
    {
        return Err("License ngoại tuyến đã hết hạn hoặc có thời hạn không hợp lệ.".to_string());
    }
    Ok(payload)
}

fn production_public_key() -> Result<[u8; 32], String> {
    let decoded = URL_SAFE_NO_PAD
        .decode(LICENSE_PUBLIC_KEY)
        .map_err(|_| "Public key của ứng dụng không hợp lệ.".to_string())?;
    decoded
        .try_into()
        .map_err(|_| "Public key của ứng dụng không hợp lệ.".to_string())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_hardware_id() -> Result<String, String> {
    let id = machine_uid::get().map_err(|_| "Không đọc được mã định danh máy".to_string())?;
    if id.trim().is_empty() {
        return Err("Mã định danh máy trống".to_string());
    }
    Ok(id)
}

#[tauri::command]
fn get_session_tokens() -> Result<Option<SessionTokens>, String> {
    let session = load_session()?;
    if session.access_token.is_empty() || session.refresh_token.is_empty() {
        return Ok(None);
    }
    Ok(Some(SessionTokens {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
    }))
}

#[tauri::command]
fn store_auth_session(access_token: String, refresh_token: String) -> Result<(), String> {
    if access_token.trim().is_empty()
        || refresh_token.trim().is_empty()
        || access_token.len() > 8192
        || refresh_token.len() > 8192
    {
        return Err("Token phiên không hợp lệ.".to_string());
    }
    let mut session = load_session()?;
    session.access_token = access_token;
    session.refresh_token = refresh_token;
    save_session(&session)
}

#[tauri::command]
fn store_offline_license(offline_license: String) -> Result<(), String> {
    let fingerprint = get_hardware_id()?;
    verify_offline_license_with_key(
        &offline_license,
        &fingerprint,
        unix_now()?,
        &production_public_key()?,
    )?;
    let mut session = load_session()?;
    session.offline_license = Some(offline_license);
    save_session(&session)
}

#[tauri::command]
fn verify_offline_license() -> Result<OfflineLicensePayload, String> {
    let session = load_session()?;
    let license = session
        .offline_license
        .ok_or("Chưa có license ngoại tuyến trên thiết bị.".to_string())?;
    verify_offline_license_with_key(
        &license,
        &get_hardware_id()?,
        unix_now()?,
        &production_public_key()?,
    )
}

#[tauri::command]
fn clear_auth_session() -> Result<(), String> {
    match fs::remove_file(session_path()?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Không xóa được phiên trong kho an toàn: {error}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_hardware_id,
            get_session_tokens,
            store_auth_session,
            store_offline_license,
            verify_offline_license,
            clear_auth_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    #[cfg(target_os = "windows")]
    fn windows_dpapi_round_trips_realistic_session() {
        let session = StoredSession {
            access_token: "a".repeat(1_400),
            refresh_token: "r".repeat(128),
            offline_license: Some("l".repeat(4_000)),
        };
        let serialized = serde_json::to_string(&session).unwrap();
        let encrypted = protect_session_data(serialized.as_bytes()).unwrap();
        assert_ne!(encrypted, serialized.as_bytes());
        assert_eq!(
            unprotect_session_data(&encrypted).unwrap(),
            serialized.as_bytes()
        );
    }

    fn signed_license(payload: &OfflineLicensePayload, signing_key: &SigningKey) -> String {
        let serialized = serde_json::to_vec(payload).unwrap();
        let signature = signing_key.sign(&serialized);
        format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(serialized),
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        )
    }

    #[test]
    fn hardware_id_is_nonempty_and_stable() {
        let first = get_hardware_id().expect("Machine ID should be available");
        assert!(!first.trim().is_empty());
        assert_eq!(first, get_hardware_id().unwrap());
    }

    #[test]
    fn verifies_signed_device_bound_license() {
        let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
        let payload = OfflineLicensePayload {
            version: 1,
            sub: "user".into(),
            device_id: "device".into(),
            fp: "machine".into(),
            issued_at: 1_000,
            valid_until: 2_000,
            subscription_expires_at: 3_000,
            nonce: "nonce".into(),
        };
        let license = signed_license(&payload, &signing_key);
        assert_eq!(
            verify_offline_license_with_key(
                &license,
                "machine",
                1_500,
                signing_key.verifying_key().as_bytes(),
            )
            .unwrap(),
            payload
        );
    }

    #[test]
    fn rejects_tampering_wrong_device_and_expiry() {
        let signing_key = SigningKey::from_bytes(&[9_u8; 32]);
        let payload = OfflineLicensePayload {
            version: 1,
            sub: "user".into(),
            device_id: "device".into(),
            fp: "machine".into(),
            issued_at: 1_000,
            valid_until: 2_000,
            subscription_expires_at: 2_000,
            nonce: "nonce".into(),
        };
        let license = signed_license(&payload, &signing_key);
        let key = signing_key.verifying_key();
        assert!(verify_offline_license_with_key(&license, "other", 1_500, key.as_bytes()).is_err());
        assert!(
            verify_offline_license_with_key(&license, "machine", 2_001, key.as_bytes()).is_err()
        );
        let replacement = if license.starts_with('A') { "B" } else { "A" };
        let tampered = format!("{}{}", replacement, &license[1..]);
        assert!(
            verify_offline_license_with_key(&tampered, "machine", 1_500, key.as_bytes()).is_err()
        );
    }
}
