mod commands;
mod models;
mod services;
mod utils;

#[cfg(test)]
mod test_helpers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::skill::import_local_skill,
            commands::skill::import_github_skill,
            commands::skill::force_import_skill,
            commands::skill::list_skills,
            commands::skill::get_skill_detail,
            commands::skill::pull_github_skill,
            commands::skill::delete_skill,
            commands::skill::delete_all_skills,
            commands::skill::set_skill_group,
            commands::skill::discover_skills,
            commands::skill::refresh_skill,
            commands::skill::list_skill_files,
            commands::skill::read_skill_file,
            commands::distribution::distribute_skill,
            commands::distribution::distribute_to_dir,
            commands::distribution::remove_distribution,
            commands::distribution::check_distribution_status,
            commands::project::create_project,
            commands::project::list_projects,
            commands::project::add_skill_to_project,
            commands::project::remove_skill_from_project,
            commands::project::delete_project,
            commands::project::rescan_project,
            commands::version::get_git_info,
            commands::config::get_app_config,
            commands::config::get_home_dir,
            commands::config::update_tool_paths,
            commands::config::update_ignored_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
