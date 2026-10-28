use serde_json::{json, Value};
use vercel_runtime::{run, service_fn, Error, Request};

#[tokio::main]
async fn main() -> Result<(), Error> { run(service_fn(handler)).await }

pub async fn handler(req: Request) -> Result<vercel_runtime::Response<vercel_runtime::ResponseBody>, Error> {
    if req.method() != hyper::Method::POST {
        return Ok(freshcart::json_response(405, json!({ "error": "Method not allowed" })));
    }
    let payload = match freshcart::read_json(req).await {
        Ok(value) => value,
        Err(_) => return Ok(freshcart::json_response(400, json!({ "error": "Invalid JSON request body" }))),
    };
    for key in ["customer_name", "phone", "address_line", "city", "pincode"] {
        let value = payload.get(key).and_then(Value::as_str).unwrap_or("").trim();
        if value.is_empty() || value.len() > 180 {
            return Ok(freshcart::json_response(400, json!({ "error": format!("Please provide a valid {key}") })));
        }
    }
    if !payload.get("pincode").and_then(Value::as_str).unwrap_or("").chars().all(|c| c.is_ascii_digit()) || payload["pincode"].as_str().unwrap_or("").len() != 6 {
        return Ok(freshcart::json_response(400, json!({ "error": "PIN code must contain exactly 6 digits" })));
    }
    let items = payload.get("items").and_then(Value::as_array);
    let Some(items) = items else { return Ok(freshcart::json_response(400, json!({ "error": "Your cart is empty" }))); };
    if items.is_empty() || items.len() > 30 {
        return Ok(freshcart::json_response(400, json!({ "error": "The cart must contain between 1 and 30 product lines" })));
    }
    for item in items {
        let sku = item.get("sku").and_then(Value::as_str).unwrap_or("");
        let quantity = item.get("quantity").and_then(Value::as_i64).unwrap_or(0);
        if !freshcart::valid_sku(sku) || !(1..=99).contains(&quantity) {
            return Ok(freshcart::json_response(400, json!({ "error": "A product or quantity in your basket is invalid" })));
        }
    }
    let mut safe_payload = payload.clone();
    // Never forward browser-supplied prices/totals into the pricing RPC.
    safe_payload.as_object_mut().map(|map| { map.remove("total"); map.remove("subtotal"); map.remove("shipping_fee"); map.remove("price"); });
    match freshcart::supabase_request(reqwest::Method::POST, "rest/v1/rpc/create_store_order", Some(json!({ "payload": safe_payload })), None, Some("return=representation")).await {
        Ok((status, value)) => Ok(freshcart::json_response(status, value)),
        Err(error) => Ok(freshcart::json_response(503, json!({ "error": error }))),
    }
}
