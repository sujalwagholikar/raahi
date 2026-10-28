use serde_json::{json, Value};
use vercel_runtime::{run, Error, Request};

#[tokio::main]
async fn main() -> Result<(), Error> { run(handler).await }

pub async fn handler(req: Request) -> Result<vercel_runtime::Response<vercel_runtime::ResponseBody>, Error> {
    let Some(auth) = freshcart::bearer_header(&req) else {
        return Ok(freshcart::json_response(401, json!({ "error": "Sign in with an approved admin account" })));
    };
    let method = req.method().clone();
    match method {
        hyper::Method::GET => {
            let path = "rest/v1/products?select=sku,name,category,price,original_price,unit,rating,badge,featured,stock,image_url,description,active&order=category.asc,name.asc";
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
            let sku = payload.get("sku").and_then(Value::as_str).unwrap_or("");
            if !freshcart::valid_sku(sku) {
                return Ok(freshcart::json_response(400, json!({ "error": "Invalid product SKU" })));
            }
            let price = payload.get("price").and_then(Value::as_f64);
            let stock = payload.get("stock").and_then(Value::as_i64);
            let active = payload.get("active").and_then(Value::as_bool);
            let Some(price) = price.filter(|v| *v >= 1.0 && *v <= 100000.0) else { return Ok(freshcart::json_response(400, json!({ "error": "Price must be between ₹1 and ₹100,000" }))); };
            let Some(stock) = stock.filter(|v| (0..=100000).contains(v)) else { return Ok(freshcart::json_response(400, json!({ "error": "Stock must be between 0 and 100,000" }))); };
            let Some(active) = active else { return Ok(freshcart::json_response(400, json!({ "error": "Availability setting is missing" }))); };
            match freshcart::supabase_request(reqwest::Method::PATCH, &format!("rest/v1/products?sku=eq.{sku}"), Some(json!({ "price": price, "stock": stock, "active": active })), Some(auth), Some("return=representation")).await {
                Ok((status, value)) => Ok(freshcart::json_response(status, value)),
                Err(error) => Ok(freshcart::json_response(503, json!({ "error": error }))),
            }
        }
        _ => Ok(freshcart::json_response(405, json!({ "error": "Method not allowed" }))),
    }
}
