use serde_json::json;
use vercel_runtime::{run, Error, Request};

#[tokio::main]
async fn main() -> Result<(), Error> { run(handler).await }

pub async fn handler(_req: Request) -> Result<serde_json::Value, Error> {
    Ok(json!({ "ok": true, "service": "freshcart-rust", "supabaseConfigured": freshcart::supabase_is_configured() }))
}
