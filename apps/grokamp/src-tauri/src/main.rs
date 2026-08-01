// Grokamp desktop shell: a native webview around the web UI.
// The interesting parts live in ../src — this is deliberately boring.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to launch grokamp");
}
