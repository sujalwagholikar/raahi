import { CONFIG } from './config.js';
import { FALLBACK_PRODUCTS } from './products.js';

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || body.message || `Request failed (${response.status})`); error.status = response.status; throw error; }
  return body;
}

export async function loadProducts() {
  try {
    const response = await fetch(`${CONFIG.apiBase}/products`, { headers: { Accept: 'application/json' } });
    const data = await parseResponse(response);
    const products = Array.isArray(data) ? data : data.products;
    if (Array.isArray(products) && products.length) return products.map(normalizeProduct);
  } catch (error) {
    console.info('[FreshCart] Showing local preview catalog until the API is configured.', error.message);
  }
  return FALLBACK_PRODUCTS.map(normalizeProduct);
}

export function normalizeProduct(product) {
  return {
    sku: String(product.sku ?? product.id ?? ''),
    name: product.name ?? 'Fresh find',
    category: product.category ?? 'Pantry',
    price: Number(product.price ?? 0),
    original_price: Number(product.original_price ?? product.price ?? 0),
    unit: product.unit ?? '1 unit',
    rating: Number(product.rating ?? 4.8),
    badge: product.badge ?? '',
    featured: Boolean(product.featured),
    stock: Number(product.stock ?? 0),
    image_url: product.image_url ?? product.image ?? '',
    description: product.description ?? 'A FreshCart favourite, chosen for everyday goodness.',
    active: product.active !== false,
  };
}

export async function createOrder(payload) {
  const response = await fetch(`${CONFIG.apiBase}/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload),
  });
  return parseResponse(response);
}
