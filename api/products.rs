use serde_json::json;
use vercel_runtime::{run, Error, Request};

#[tokio::main]
async fn main() -> Result<(), Error> { run(handler).await }

pub async fn handler(req: Request) -> Result<vercel_runtime::Response<vercel_runtime::ResponseBody>, Error> {
    if req.method() != hyper::Method::GET {
        return Ok(freshcart::json_response(405, json!({ "error": "Method not allowed" })));
    }
    let path = "rest/v1/products?select=sku,name,category,price,original_price,unit,rating,badge,featured,stock,image_url,description,active&active=eq.true&order=featured.desc,category.asc,name.asc";
    match freshcart::supabase_request(reqwest::Method::GET, path, None, None, None).await {
        Ok((status, value)) => Ok(freshcart::json_response(status, value)),
        Err(error) => Ok(freshcart::json_response(503, json!({ "error": error }))),
    }
}
