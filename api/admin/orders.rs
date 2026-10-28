use serde_json::{json, Value};
use vercel_runtime::{run, service_fn, Error, Request};

#[tokio::main]
async fn main() -> Result<(), Error> { run(service_fn(handler)).await }

pub async fn handler(req: Request) -> Result<vercel_runtime::Response<vercel_runtime::ResponseBody>, Error> {
    let Some(auth) = freshcart::bearer_header(&req) else {
        return Ok(freshcart::json_response(401, json!({ "error": "Sign in with an approved admin account" })));
    };
    let method = req.method().clone();
    match method {
        hyper::Method::GET => {
            let path = "rest/v1/orders?select=*,order_items(*)&order=created_at.desc&limit=100";
            match freshcart::supabase_request(reqwest::Method::GET, path, None, Some(auth), None).await {
                Ok((status, value)) => Ok(freshcart::json_response(status, value)),
                Err(error) => Ok(freshcart::json_response(503, json!({ "error": error }))),
            }
        }
        hyper::Method::PATCH => {
            let payload = match freshcart::read_json(req).await {
                Ok(value) => value,
                Err(_) => return Ok(freshcart::json_response(400, json!({ "error": "Invalid JSON request body" }))),
            };
            let id = payload.get("id").and_then(Value::as_str).unwrap_or("");
            let status = payload.get("status").and_then(Value::as_str).unwrap_or("");
            let allowed = ["pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"];
            if id.is_empty() || id.len() > 64 || !allowed.contains(&status) {
                return Ok(freshcart::json_response(400, json!({ "error": "Invalid order ID or status" })));
            }
            match freshcart::supabase_request(reqwest::Method::PATCH, &format!("rest/v1/orders?id=eq.{id}"), Some(json!({ "status": status })), Some(auth), Some("return=representation")).await {
                Ok((status, value)) => Ok(freshcart::json_response(status, value)),
                Err(error) => Ok(freshcart::json_response(503, json!({ "error": error }))),
            }
        }
        _ => Ok(freshcart::json_response(405, json!({ "error": "Method not allowed" }))),
    }
}
