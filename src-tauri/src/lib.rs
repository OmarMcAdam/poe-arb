// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn http_get_json(url: String) -> Result<serde_json::Value, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("invalid url: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("only https urls are allowed".to_string());
    }

    let host = parsed.host_str().unwrap_or("");
    if host != "poe.ninja" {
        return Err("only poe.ninja is allowed".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("poe2-arb/0.1 (tauri)")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("http client build failed: {e}"))?;

    let res = client
        .get(parsed)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("http request failed: {e}"))?;

    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("http error: {status} {body}"));
    }

    res.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid json: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, http_get_json])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
