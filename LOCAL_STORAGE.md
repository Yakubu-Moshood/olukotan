# Local storage

Creative projects live only where the writer chooses. Application data uses the standard Tauri application-data directory and currently contains `olukotan.sqlite`, an expendable list of recent projects and settings.

Google Drive for Desktop, OneDrive, and Dropbox directories are treated as normal local folders. The application does not authenticate with, upload to, or depend on a cloud API. The storage label is inferred from the path and never gates saving.

If the SQLite index is deleted or damaged, open the folder containing `olukotan-project.json`; all creative content remains available. If a project is not writable, it opens read-only and its files remain untouched.

For portable deployments and automated tests, `OLUKOTAN_APP_DATA_DIR` may override only the expendable application-data directory. It does not override or relocate writer-chosen project folders.
