//! Canonical RuForge library: the single source of truth for what media exists.
//!
//! Ownership rules (do not weaken these when extending the module):
//! - `config` owns scan-root configuration, persisted via `tauri_plugin_store`.
//!   Nothing outside this module writes that store file.
//! - `scanner` is the only ingestion layer: the only code in the whole app that
//!   walks the media filesystem or runs ffprobe.
//! - `library_state` holds the canonical in-memory index built by `scanner` and
//!   orchestrates reindexing.
//! - `resolver` is the only path exposed to the companion server. It separates
//!   metadata-returning methods (safe for JSON responses) from path-returning
//!   methods (only the byte-serving stream/thumb routes may call those).
//! - `commands` is the Tauri-facing surface for the desktop UI. The desktop
//!   projection is deliberately path-bearing (trusted first-party surface); the
//!   companion projection is deliberately id-only. These are two separate types
//!   in `types.rs`, not one shared struct with conditionally-skipped fields.

pub mod commands;
pub mod config;
pub mod library_state;
pub mod remux;
pub mod resolver;
pub mod scanner;
pub mod types;

pub use library_state::LibraryState;
