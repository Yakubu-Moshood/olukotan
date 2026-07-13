use crate::{error::AppResult, model::{AppSettings, ProjectManifest, RecentProject}};
use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

pub struct Database { path: PathBuf }

impl Database {
    pub fn new(path: PathBuf) -> AppResult<Self> {
        let db = Self { path };
        let connection = db.connect()?;
        connection.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS recent_projects (
               project_id TEXT PRIMARY KEY, title TEXT NOT NULL, project_type TEXT NOT NULL,
               path TEXT NOT NULL UNIQUE, storage_mode TEXT NOT NULL, last_opened_at TEXT NOT NULL,
               modified_at TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, page_count INTEGER NOT NULL DEFAULT 1
             );
             CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
        )?;
        Ok(db)
    }

    fn connect(&self) -> AppResult<Connection> { Ok(Connection::open(&self.path)?) }

    pub fn touch_recent(&self, manifest: &ProjectManifest, path: &Path, screenplay: &str) -> AppResult<()> {
        let line_count = screenplay.lines().count().max(1) as u32;
        let page_count = line_count.div_ceil(55).max(1);
        self.connect()?.execute(
            "INSERT INTO recent_projects (project_id,title,project_type,path,storage_mode,last_opened_at,modified_at,pinned,page_count)
             VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8)
             ON CONFLICT(project_id) DO UPDATE SET title=excluded.title, project_type=excluded.project_type,
             path=excluded.path, storage_mode=excluded.storage_mode, last_opened_at=excluded.last_opened_at,
             modified_at=excluded.modified_at, page_count=excluded.page_count",
            params![manifest.project_id, manifest.title, manifest.project_type, path.to_string_lossy(), manifest.storage_mode,
                    Utc::now().to_rfc3339(), manifest.updated_at, page_count]
        )?;
        Ok(())
    }

    pub fn list_recent(&self) -> AppResult<Vec<RecentProject>> {
        let connection = self.connect()?;
        let mut statement = connection.prepare("SELECT project_id,title,project_type,path,storage_mode,last_opened_at,modified_at,pinned,page_count FROM recent_projects ORDER BY pinned DESC,last_opened_at DESC LIMIT 50")?;
        let values = statement.query_map([], |row| Ok(RecentProject {
            project_id: row.get(0)?, title: row.get(1)?, project_type: row.get(2)?, path: row.get(3)?, storage_mode: row.get(4)?,
            last_opened_at: row.get(5)?, modified_at: row.get(6)?, pinned: row.get::<_, i64>(7)? != 0, page_count: row.get(8)?,
        }))?.collect::<Result<Vec<_>, _>>()?;
        Ok(values)
    }

    pub fn remove_recent(&self, project_id: &str) -> AppResult<()> {
        self.connect()?.execute("DELETE FROM recent_projects WHERE project_id=?1", [project_id])?;
        Ok(())
    }

    pub fn toggle_pin(&self, project_id: &str, pinned: bool) -> AppResult<()> {
        self.connect()?.execute("UPDATE recent_projects SET pinned=?2 WHERE project_id=?1", params![project_id, pinned])?;
        Ok(())
    }

    pub fn get_settings(&self) -> AppResult<AppSettings> {
        let connection = self.connect()?;
        let mut settings = AppSettings::default();
        let mut statement = connection.prepare("SELECT key,value FROM settings")?;
        for entry in statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))? {
            let (key, value) = entry?;
            match key.as_str() {
                "defaultProjectFolder" => settings.default_project_folder = value,
                "defaultAuthor" => settings.default_author = value,
                "theme" if matches!(value.as_str(), "system" | "light" | "dark") => settings.theme = value,
                "autosaveSeconds" => settings.autosave_seconds = value.parse().unwrap_or(5).clamp(2, 60),
                _ => {}
            }
        }
        Ok(settings)
    }

    pub fn save_settings(&self, settings: &AppSettings) -> AppResult<()> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        for (key, value) in [
            ("defaultProjectFolder", settings.default_project_folder.clone()), ("defaultAuthor", settings.default_author.clone()),
            ("theme", settings.theme.clone()), ("autosaveSeconds", settings.autosave_seconds.clamp(2, 60).to_string())
        ] { transaction.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value])?; }
        transaction.commit()?;
        Ok(())
    }
}
