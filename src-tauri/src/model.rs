use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u8,
    pub application: String,
    pub project_id: String,
    pub title: String,
    pub project_type: String,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    pub primary_document: String,
    pub storage_mode: String,
    pub language: String,
    pub page_size: String,
    pub screenplay_standard: String,
    pub revision_mode: bool,
    pub current_revision_set: Option<String>,
    pub import_history: Vec<serde_json::Value>,
    pub export_history: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryPayload { pub content: String, pub modified_at: u64 }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPayload {
    pub manifest: ProjectManifest,
    pub screenplay: String,
    pub project_path: String,
    pub read_only: bool,
    pub modified_at: u64,
    pub recovery: Option<RecoveryPayload>,
    pub project_data: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub project_id: String,
    pub title: String,
    pub project_type: String,
    pub path: String,
    pub storage_mode: String,
    pub last_opened_at: String,
    pub modified_at: String,
    pub pinned: bool,
    pub page_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_project_folder: String,
    pub default_author: String,
    pub theme: String,
    pub autosave_seconds: u32,
}

impl Default for AppSettings {
    fn default() -> Self { Self { default_project_folder: String::new(), default_author: String::new(), theme: "system".into(), autosave_seconds: 5 } }
}
