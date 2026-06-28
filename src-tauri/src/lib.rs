// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init tables",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "agent workspace: folders, tasks, sub_agents, agent_runs, agent_events",
            sql: include_str!("../migrations/002_agents.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "model preferences: starred and is_default columns on models",
            sql: include_str!("../migrations/003_model_preferences.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "global application settings",
            sql: include_str!("../migrations/004_app_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "run_steps: full step-by-step trace of sub-agent runs",
            sql: include_str!("../migrations/005_run_traces.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "agent_runs.turn: per-run loop turn counter for resume",
            sql: include_str!("../migrations/006_agent_runs_turn.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:powerui.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
