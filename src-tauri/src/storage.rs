use crate::{error::{AppError, AppResult}, model::{ProjectManifest, ProjectPayload, RecoveryPayload}};
use chrono::Utc;
use std::{fs, io::Write, path::{Path, PathBuf}, time::UNIX_EPOCH};
use uuid::Uuid;

const MANIFEST: &str = "olukotan-project.json";
const SCREENPLAY: &str = "screenplay.fountain";
const PROJECT_DATA: &str = "screenplay-data.json";

fn default_project_data() -> serde_json::Value {
    serde_json::json!({
        "schemaVersion": 1,
        "screenplaySettings": {
            "preset": "spec-script",
            "sceneNumbers": { "enabled": false, "mode": "automatic", "position": "both", "startAt": 1, "showInEditor": true, "showInExport": true, "showInPrint": true },
            "pageNumbers": { "enabled": true, "position": "top-right", "startOnPage": 2, "customStartPage": 1, "firstVisibleNumber": 1, "hideOnFirstPage": true },
            "continueds": { "character": "automatic", "dialogueMore": true, "dialogueContinued": true, "sceneContinued": "off" },
            "capitalisation": { "sceneHeadings": true, "characters": true, "transitions": true, "shots": true },
            "revisions": { "enabled": false, "activeSetId": null, "showMarks": true },
            "pagination": { "pageSize": "A4", "viewMode": "page" },
            "exportDefaults": { "format": "pdf", "includeTitlePage": true, "includeSceneNumbers": true, "includePageNumbers": true, "includeScriptNotes": false, "includeRevisionMarks": false, "includeOmittedScenes": false }
        },
        "scenes": [],
        "productionSnapshots": []
    })
}

pub fn storage_mode(path: &Path) -> String {
    let value = path.to_string_lossy().to_lowercase();
    if value.contains("google drive") || value.contains("my drive") { "google-drive" }
    else if value.contains("onedrive") { "onedrive" }
    else if value.contains("dropbox") { "dropbox" }
    else if path.components().next().is_some() { "local" }
    else { "unknown" }.to_string()
}

fn modified_millis(path: &Path) -> AppResult<u64> {
    Ok(fs::metadata(path)?.modified()?.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let temp = path.with_extension(format!("{}.tmp", path.extension().and_then(|v| v.to_str()).unwrap_or("file")));
    let backup = path.with_extension(format!("{}.bak", path.extension().and_then(|v| v.to_str()).unwrap_or("file")));
    let mut file = fs::File::create(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    if path.exists() {
        if backup.exists() { fs::remove_file(&backup)?; }
        fs::rename(path, &backup)?;
        if let Err(error) = fs::rename(&temp, path) {
            let _ = fs::rename(&backup, path);
            return Err(error.into());
        }
        fs::remove_file(backup)?;
    } else {
        fs::rename(&temp, path)?;
    }
    Ok(())
}

fn validate_manifest(manifest: &ProjectManifest) -> AppResult<()> {
    if manifest.schema_version != 1 { return Err(AppError::Validation(format!("Schema version {} is not supported.", manifest.schema_version))); }
    if manifest.application != "Olukotan" { return Err(AppError::Validation("This folder does not contain an Olukotan project.".into())); }
    if manifest.primary_document != SCREENPLAY { return Err(AppError::Validation("The primary document path is not supported.".into())); }
    Ok(())
}

fn safe_folder_name(title: &str) -> String {
    let cleaned: String = title.trim().chars().filter(|c| !r#"<>:\"/\\|?*"#.contains(*c) && !c.is_control()).collect();
    cleaned.trim_end_matches(|c| c == '.' || c == ' ').to_string()
}

pub fn create(parent: &Path, title: String, project_type: String, author: String) -> AppResult<ProjectPayload> {
    if title.trim().is_empty() { return Err(AppError::Validation("Enter a project title.".into())); }
    if !parent.is_dir() { return Err(AppError::Validation("Choose an existing parent folder.".into())); }
    let folder = safe_folder_name(&title);
    if folder.is_empty() { return Err(AppError::Validation("The project title cannot be used as a Windows folder name.".into())); }
    let root = parent.join(folder);
    if root.exists() { return Err(AppError::Validation("A folder with this project name already exists. Choose another title or location.".into())); }
    fs::create_dir(&root)?;
    let setup = (|| -> AppResult<ProjectPayload> {
        for folder in ["research", "attachments", "versions", "exports", "recovery"] { fs::create_dir(root.join(folder))?; }
        let now = Utc::now().to_rfc3339();
        let manifest = ProjectManifest {
            schema_version: 1, application: "Olukotan".into(), project_id: Uuid::new_v4().to_string(), title: title.trim().into(),
            project_type, author: author.trim().into(), created_at: now.clone(), updated_at: now,
            primary_document: SCREENPLAY.into(), storage_mode: storage_mode(&root), language: "en-GB".into(), page_size: "A4".into(),
            screenplay_standard: "industry-standard".into(), revision_mode: false, current_revision_set: None,
            import_history: vec![], export_history: vec![],
        };
        let screenplay = format!("Title: {}\nAuthor: {}\nDraft date: {}\n\n", manifest.title, manifest.author, Utc::now().format("%e %B %Y"));
        atomic_write(&root.join(MANIFEST), serde_json::to_string_pretty(&manifest)?.as_bytes())?;
        atomic_write(&root.join(SCREENPLAY), screenplay.as_bytes())?;
        atomic_write(&root.join(PROJECT_DATA), serde_json::to_string_pretty(&default_project_data())?.as_bytes())?;
        for (name, heading) in [("treatment.md", "Treatment"), ("synopsis.md", "Synopsis"), ("notes.md", "Notes")] {
            atomic_write(&root.join(name), format!("# {}\n\n", heading).as_bytes())?;
        }
        for name in ["characters.json", "locations.json", "structure.json", "decisions.json"] { atomic_write(&root.join(name), b"[]\n")?; }
        open(&root)
    })();
    if setup.is_err() { let _ = fs::remove_dir_all(&root); }
    setup
}

pub fn open(root: &Path) -> AppResult<ProjectPayload> {
    let manifest_path = root.join(MANIFEST);
    if !manifest_path.is_file() { return Err(AppError::Validation("No olukotan-project.json was found in this folder.".into())); }
    let manifest: ProjectManifest = serde_json::from_str(&fs::read_to_string(&manifest_path)?)?;
    validate_manifest(&manifest)?;
    let script_path = root.join(&manifest.primary_document);
    if !script_path.is_file() { return Err(AppError::Validation("The primary screenplay file is missing. Check the recovery and versions folders before creating a replacement.".into())); }
    let screenplay = fs::read_to_string(&script_path)?;
    let data_path = root.join(PROJECT_DATA);
    let project_data = if data_path.is_file() {
        serde_json::from_str(&fs::read_to_string(&data_path)?)?
    } else {
        let value = default_project_data();
        atomic_write(&data_path, serde_json::to_string_pretty(&value)?.as_bytes())?;
        value
    };
    for (name, default) in [("treatment.md", "# Treatment\n\n"), ("synopsis.md", "# Synopsis\n\n"), ("notes.md", "# Notes\n\n"), ("characters.json", "[]\n"), ("locations.json", "[]\n"), ("structure.json", "[]\n"), ("decisions.json", "[]\n")] {
        let path = root.join(name); if !path.exists() { let _ = atomic_write(&path, default.as_bytes()); }
    }
    for name in ["research", "attachments", "versions", "exports", "recovery"] { let _ = fs::create_dir(root.join(name)); }
    let modified_at = modified_millis(&script_path)?;
    let recovery_path = root.join("recovery").join("unsaved.fountain");
    let recovery = if recovery_path.is_file() && modified_millis(&recovery_path)? > modified_at {
        let content = fs::read_to_string(&recovery_path)?;
        if content != screenplay { Some(RecoveryPayload { content, modified_at: modified_millis(&recovery_path)? }) } else { None }
    } else { None };
    let read_only = fs::OpenOptions::new().append(true).open(&script_path).is_err();
    Ok(ProjectPayload { manifest, screenplay, project_path: root.to_string_lossy().to_string(), read_only, modified_at, recovery, project_data })
}

pub fn save(root: &Path, content: &str, expected_modified_at: u64, project_data: &serde_json::Value) -> AppResult<u64> {
    let path = root.join(SCREENPLAY);
    let actual = modified_millis(&path)?;
    if expected_modified_at > 0 && actual != expected_modified_at {
        return Err(AppError::Validation("The screenplay changed outside Olukotan. Saving stopped so neither version is overwritten. Reopen the project to compare the files.".into()));
    }
    atomic_write(&path, content.as_bytes())?;
    atomic_write(&root.join(PROJECT_DATA), serde_json::to_string_pretty(project_data)?.as_bytes())?;
    let recovery = root.join("recovery").join("unsaved.fountain");
    if recovery.exists() { let _ = fs::remove_file(recovery); }
    let mut manifest: ProjectManifest = serde_json::from_str(&fs::read_to_string(root.join(MANIFEST))?)?;
    manifest.updated_at = Utc::now().to_rfc3339();
    atomic_write(&root.join(MANIFEST), serde_json::to_string_pretty(&manifest)?.as_bytes())?;
    modified_millis(&path)
}

pub fn write_recovery(root: &Path, content: &str) -> AppResult<()> {
    let folder = root.join("recovery");
    fs::create_dir_all(&folder)?;
    atomic_write(&folder.join("unsaved.fountain"), content.as_bytes())
}

pub fn discard_recovery(root: &Path) -> AppResult<()> {
    let path = root.join("recovery").join("unsaved.fountain");
    if path.exists() { fs::remove_file(path)?; }
    Ok(())
}

pub fn record_export(root: &Path, entry: serde_json::Value) -> AppResult<()> {
    let manifest_path = root.join(MANIFEST);
    let mut manifest: ProjectManifest = serde_json::from_str(&fs::read_to_string(&manifest_path)?)?;
    validate_manifest(&manifest)?;
    manifest.export_history.push(entry);
    manifest.updated_at = Utc::now().to_rfc3339();
    atomic_write(&manifest_path, serde_json::to_string_pretty(&manifest)?.as_bytes())
}

pub fn path(value: String) -> PathBuf { PathBuf::from(value) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_synced_locations() {
        assert_eq!(storage_mode(Path::new(r"C:\Users\Writer\Google Drive\Scripts")), "google-drive");
        assert_eq!(storage_mode(Path::new(r"C:\Users\Writer\OneDrive\Scripts")), "onedrive");
    }
    #[test]
    fn removes_windows_reserved_characters() { assert_eq!(safe_folder_name("My: Film?"), "My Film"); }
}
