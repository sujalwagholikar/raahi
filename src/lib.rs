use http_body_util::BodyExt;
use serde_json::{json, Value};
use std::env;
use vercel_runtime::{Error, Request, Response, ResponseBody};

/// Read and parse a JSON request body with the current official Vercel Rust runtime.
pub async fn read_json(req: Request) -> Result<Value, Error> {
    let bytes = req.into_body().collect().await?.to_bytes();
    let value = serde_json::from_slice::<Value>(&bytes)?;
    Ok(value)
}

pub fn json_response(status: u16, value: Value) -> Response<ResponseBody> {
    let status = hyper::StatusCode::from_u16(status).unwrap_or(hyper::StatusCode::INTERNAL_SERVER_ERROR);
    Response::builder()
        .status(status)
        .header(hyper::header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header(hyper::header::CACHE_CONTROL, "no-store")
        .body(value.to_string().into())
        .expect("a valid JSON HTTP response can be built")
}

pub fn supabase_is_configured() -> bool {
    env::var("SUPABASE_URL").or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_URL")).is_ok()
        && env::var("SUPABASE_PUBLISHABLE_KEY").or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")).is_ok()
}

/// Proxy a request to Supabase PostgREST/Auth-protected data APIs.
/// The supplied browser JWT (admin routes) is forwarded; public routes use the publishable key.
pub async fn supabase_request(
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
    authorization: Option<String>,
    prefer: Option<&str>,
) -> Result<(u16, Value), String> {
    let base_url = env::var("SUPABASE_URL")
        .or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_URL"))
        .map_err(|_| "SUPABASE_URL is not configured on the server".to_string())?;
    let api_key = env::var("SUPABASE_PUBLISHABLE_KEY")
        .or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
        .map_err(|_| "SUPABASE_PUBLISHABLE_KEY is not configured on the server".to_string())?;

    let auth_value = authorization.unwrap_or_else(|| format!("Bearer {api_key}"));
    let url = format!("{}/{}", base_url.trim_end_matches('/'), path.trim_start_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Could not initialize Supabase request: {e}"))?;

    let mut request = client
        .request(method, url)
        .header("apikey", &api_key)
        .header(reqwest::header::AUTHORIZATION, auth_value)
        .header(reqwest::header::ACCEPT, "application/json");
    if let Some(payload) = body {
        request = request.json(&payload);
    }
    if let Some(preference) = prefer {
        request = request.header("Prefer", preference);
    }

    let response = request.send().await.map_err(|e| format!("Supabase request failed: {e}"))?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| format!("Could not read Supabase response: {e}"))?;
    let value = if text.is_empty() { json!({}) } else {
        serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!({ "message": text }))
    };
    Ok((status, value))
}

pub fn bearer_header(req: &Request) -> Option<String> {
    req.headers().get(hyper::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.starts_with("Bearer "))
        .map(str::to_owned)
}

pub fn valid_sku(sku: &str) -> bool {
    !sku.is_empty() && sku.len() <= 40 && sku.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
