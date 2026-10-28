const STORAGE_KEY = 'freshcart_cart_v1';
const read = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };
let cart = read();
const listeners = new Set();
const emit = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); for (const listener of listeners) listener(getCart()); };
export const subscribeCart = (listener) => { listeners.add(listener); listener(getCart()); return () => listeners.delete(listener); };
export function getCart() { return { ...cart }; }
export function addToCart(sku, quantity = 1) { cart[sku] = Math.min(99, (cart[sku] || 0) + quantity); emit(); }
export function setQuantity(sku, quantity) { if (quantity <= 0) delete cart[sku]; else cart[sku] = Math.min(99, quantity); emit(); }
export function removeFromCart(sku) { delete cart[sku]; emit(); }
export function clearCart() { cart = {}; emit(); }
export function cartCount() { return Object.values(cart).reduce((sum, qty) => sum + qty, 0); }
