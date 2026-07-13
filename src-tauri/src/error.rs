use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Olukotan could not access this location: {0}")]
    Io(#[from] std::io::Error),
    #[error("This project manifest is not valid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Olukotan's local index could not be updated: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("{0}")]
    Validation(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
