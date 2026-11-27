mod database;
mod error;
mod model;
mod storage;

use database::Database;
use error::{AppError, AppResult};
use model::{AppSettings, ProjectPayload, RecentProject};
use std::{path::PathBuf, process::Command, sync::Mutex};
use tauri::{Manager, State};

struct AppState(Mutex<Database>);

fn track(db: State<'_, AppState>, payload: &ProjectPayload) -> AppResult<()> {
    db.0.lock().map_err(|_| AppError::Validation("The local project index is temporarily unavailable.".into()))?
        .touch_recent(&payload.manifest, &PathBuf::from(&payload.project_path), &payload.screenplay)
}

#[tauri::command]
fn create_project(db: State<'_, AppState>, parent_path: String, title: String, project_type: String, author: String) -> AppResult<ProjectPayload> {
    let payload = storage::create(&storage::path(parent_path), title, project_type, author)?;
    track(db, &payload)?;
    Ok(payload)
}

#[tauri::command]
fn open_project(db: State<'_, AppState>, project_path: String) -> AppResult<ProjectPayload> {
    let payload = storage::open(&storage::path(project_path))?;
    track(db, &payload)?;
    Ok(payload)
}

#[tauri::command]
fn save_screenplay(project_path: String, content: String, expected_modified_at: u64, project_data: serde_json::Value) -> AppResult<u64> {
    storage::save(&storage::path(project_path), &content, expected_modified_at, &project_data)
}

#[tauri::command]
fn write_recovery(project_path: String, content: String) -> AppResult<()> { storage::write_recovery(&storage::path(project_path), &content) }

#[tauri::command]
fn discard_recovery(project_path: String) -> AppResult<()> { storage::discard_recovery(&storage::path(project_path)) }

#[tauri::command]
fn record_export(project_path: String, entry: serde_json::Value) -> AppResult<()> { storage::record_export(&storage::path(project_path), entry) }

#[tauri::command]
fn write_version(project_path: String, content: String, project_data: serde_json::Value, keep: usize) -> AppResult<()> { storage::write_version(&storage::path(project_path), &content, &project_data, keep) }

#[tauri::command]
fn list_versions(project_path: String) -> AppResult<Vec<storage::VersionEntry>> { storage::list_versions(&storage::path(project_path)) }

#[tauri::command]
fn read_version(project_path: String, name: String) -> AppResult<storage::VersionPayload> { storage::read_version(&storage::path(project_path), &name) }

#[tauri::command]
fn recent_projects(db: State<'_, AppState>) -> AppResult<Vec<RecentProject>> {
    db.0.lock().map_err(|_| AppError::Validation("The local project index is temporarily unavailable.".into()))?.list_recent()
}

#[tauri::command]
fn remove_recent(db: State<'_, AppState>, project_id: String) -> AppResult<()> {
    db.0.lock().map_err(|_| AppError::Validation("The local project index is temporarily unavailable.".into()))?.remove_recent(&project_id)
}

#[tauri::command]
fn pin_recent(db: State<'_, AppState>, project_id: String, pinned: bool) -> AppResult<()> {
    db.0.lock().map_err(|_| AppError::Validation("The local project index is temporarily unavailable.".into()))?.toggle_pin(&project_id, pinned)
}

#[tauri::command]
fn get_settings(db: State<'_, AppState>) -> AppResult<AppSettings> {
    db.0.lock().map_err(|_| AppError::Validation("Settings are temporarily unavailable.".into()))?.get_settings()
}

#[tauri::command]
fn save_settings(db: State<'_, AppState>, settings: AppSettings) -> AppResult<()> {
    db.0.lock().map_err(|_| AppError::Validation("Settings are temporarily unavailable.".into()))?.save_settings(&settings)
}

#[tauri::command]
fn reveal_in_explorer(project_path: String) -> AppResult<()> {
    Command::new("explorer.exe").arg(storage::path(project_path)).spawn()?;
    Ok(())
}

/// Writes an exported file (PDF, FDX, backup, report…) to a path the writer chose in the native Save dialog.
#[tauri::command]
fn write_export_file(path: String, data: Vec<u8>) -> AppResult<()> {
    const ALLOWED: [&str; 11] = ["pdf", "fdx", "docx", "rtf", "fountain", "txt", "md", "html", "zip", "csv", "json"];
    let target = PathBuf::from(&path);
    let extension = target.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    if !ALLOWED.contains(&extension.as_str()) {
        return Err(AppError::Validation(format!("Olukotan doesn't save .{extension} files.")));
    }
    std::fs::write(&target, data)?;
    Ok(())
}

/// Opens a web or email link in the writer's default browser or mail app.
#[tauri::command]
fn open_external(url: String) -> AppResult<()> {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")) {
        return Err(AppError::Validation("Only web and email links can be opened.".into()));
    }
    #[cfg(target_os = "windows")]
    Command::new("explorer.exe").arg(&url).spawn()?;
    #[cfg(target_os = "macos")]
    Command::new("open").arg(&url).spawn()?;
    #[cfg(all(unix, not(target_os = "macos")))]
    Command::new("xdg-open").arg(&url).spawn()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data = match std::env::var_os("OLUKOTAN_APP_DATA_DIR") {
                Some(path) => PathBuf::from(path),
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&data)?;
            let db = Database::new(data.join("olukotan.sqlite")).map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(AppState(Mutex::new(db)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![create_project, open_project, save_screenplay, write_recovery, discard_recovery, record_export, write_version, list_versions, read_version, recent_projects, remove_recent, pin_recent, get_settings, save_settings, reveal_in_explorer, write_export_file, open_external])
        .run(tauri::generate_context!())
        .expect("Olukotan failed to start");
}
