import { CONFIG } from './config.js';
import { money, escapeHTML, toast } from './ui.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STATUS_LABELS = { pending:'Pending', confirmed:'Confirmed', packed:'Packed', out_for_delivery:'Out for delivery', delivered:'Delivered', cancelled:'Cancelled' };
let sb;
let session = null;
let orders = [];
let inventory = [];
let activeView = 'overview';
let loaded = false;

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { day:'2-digit', month:'short', year:'numeric' }).format(date);
}
function orderTotal(order) { return Number(order.total ?? order.grand_total ?? 0); }
function orderItems(order) { return Array.isArray(order.order_items) ? order.order_items : []; }
function orderItemCount(order) { return orderItems(order).reduce((sum, item) => sum + Number(item.quantity || 0), 0); }
function statusBadge(status) { const key = STATUS_LABELS[status] ? status : 'pending'; return `<span class="status-pill status-${key}">${escapeHTML(STATUS_LABELS[key])}</span>`; }
function customerCell(order) { return `<div class="customer-cell"><strong>${escapeHTML(order.customer_name || 'Customer')}</strong><small>${escapeHTML(order.phone || order.email || 'No contact')}</small></div>`; }
function orderNumberCell(order) { return `<div class="order-number">${escapeHTML(order.order_number || (order.id || '').slice(0, 8))}<small>${escapeHTML(order.payment_method || 'cod').toUpperCase()} · ${escapeHTML(order.city || '')}</small></div>`; }
function renderOverview() {
  const revenue = orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + orderTotal(order), 0);
  $('#statOrders').textContent = orders.length.toLocaleString('en-IN');
  $('#statRevenue').textContent = money(revenue);
  $('#statPending').textContent = orders.filter((order) => ['pending', 'confirmed'].includes(order.status)).length.toLocaleString('en-IN');
  $('#statProducts').textContent = inventory.filter((product) => product.active !== false).length.toLocaleString('en-IN');
  $('#sidebarOrderCount').textContent = orders.filter((order) => order.status === 'pending').length || '0';
  const recent = orders.slice(0, 7);
  $('#recentOrdersBody').innerHTML = recent.length ? recent.map((order) => `<tr><td>${orderNumberCell(order)}</td><td>${customerCell(order)}</td><td>${dateLabel(order.created_at)}</td><td><strong>${money(orderTotal(order))}</strong></td><td>${statusBadge(order.status)}</td></tr>`).join('') : '<tr><td colspan="5" class="table-placeholder">No orders yet. Customer orders will appear here.</td></tr>';
}
function filteredOrders() {
  const query = ($('#orderSearch')?.value || '').trim().toLowerCase();
  const status = $('#statusFilter')?.value || 'all';
  return orders.filter((order) => {
    const matchesStatus = status === 'all' || order.status === status;
    const haystack = [order.order_number, order.customer_name, order.phone, order.email, order.city, order.id].join(' ').toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
}
function renderOrders() {
  const list = filteredOrders();
  $('#allOrdersBody').innerHTML = list.length ? list.map((order) => `<tr><td>${orderNumberCell(order)}</td><td>${customerCell(order)}</td><td><span title="${escapeHTML(orderItems(order).map((item) => `${item.product_name} × ${item.quantity}`).join(', '))}">${orderItemCount(order)} item${orderItemCount(order) === 1 ? '' : 's'}</span></td><td>${dateLabel(order.created_at)}</td><td><strong>${money(orderTotal(order))}</strong></td><td><div class="status-edit-cell"><select class="admin-status-select" data-status-select="${escapeHTML(order.id)}">${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="save-inventory" data-save-status="${escapeHTML(order.id)}">Save</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="table-placeholder">No matching orders found.</td></tr>';
}
function renderInventory() {
  $('#inventoryBody').innerHTML = inventory.length ? inventory.map((product) => `<tr><td><div class="inventory-product"><img src="${escapeHTML(product.image_url || '')}" alt="" loading="lazy"><span><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.sku)}</small></span></div></td><td>${escapeHTML(product.category || '—')}</td><td><input class="inventory-input" type="number" min="1" max="100000" step="1" value="${Number(product.price || 0)}" data-product-price="${escapeHTML(product.sku)}" aria-label="Price for ${escapeHTML(product.name)}"></td><td><input class="inventory-input stock-input" type="number" min="0" max="100000" step="1" value="${Number(product.stock || 0)}" data-product-stock="${escapeHTML(product.sku)}" aria-label="Stock for ${escapeHTML(product.name)}"></td><td><label class="availability-toggle"><input type="checkbox" data-product-active="${escapeHTML(product.sku)}" ${product.active !== false ? 'checked' : ''}> Live</label></td><td><button class="save-inventory" data-save-product="${escapeHTML(product.sku)}">Save changes</button></td></tr>`).join('') : '<tr><td colspan="6" class="table-placeholder">No products found.</td></tr>';
}
function setView(view) {
  activeView = view;
  $$('.sidebar-link').forEach((button) => button.classList.toggle('active', button.dataset.adminView === view));
  $('#adminPageTitle').textContent = view === 'overview' ? 'Overview' : view === 'orders' ? 'Orders' : 'Inventory';
  $('#overviewOrdersPanel').hidden = view !== 'overview';
  $('#ordersView').hidden = view !== 'orders';
  $('#inventoryView').hidden = view !== 'inventory';
}
async function api(path, options = {}) {
  const token = session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const response = await fetch(`${CONFIG.apiBase}${path}`, { ...options, headers: { Accept:'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}), Authorization:`Bearer ${token}`, ...(options.headers || {}) } });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('This account is not approved for store admin access. Check admin_users and your RLS policies.');
    throw new Error(value.message || value.error || `Request failed (${response.status})`);
  }
  return value;
}
async function loadDashboard() {
  if (!session) return;
  $('#refreshButton').classList.add('is-loading');
  try {
    const [orderRows, productRows] = await Promise.all([api('/admin/orders'), api('/admin/products')]);
    orders = Array.isArray(orderRows) ? orderRows : [];
    inventory = Array.isArray(productRows) ? productRows : [];
    renderOverview(); renderOrders(); renderInventory(); loaded = true;
    $('#loginPanel').hidden = true; $('#dashboardContent').hidden = false;
    const email = session.user?.email || 'Store admin';
    $('.sidebar-user strong').textContent = email;
    $('.sidebar-user small').textContent = 'Signed in securely';
    $('.admin-avatar').textContent = email.slice(0, 2).toUpperCase();
    $('#signOutButton').hidden = false;
    $('.live-status').innerHTML = '<i></i> Connected to Supabase';
  } catch (error) {
    if ($('#dashboardContent').hidden) {
      $('#loginError').textContent = error.message;
    } else toast(error.message, 'error', '#adminToastRegion');
    if (error.message.includes('not approved') || error.message.includes('session has expired')) {
      $('#dashboardContent').hidden = true; $('#loginPanel').hidden = false;
    }
  } finally { $('#refreshButton').classList.remove('is-loading'); }
}
async function signIn(email, password) {
  $('#loginError').textContent = '';
  const submit = $('.login-submit'); submit.disabled = true; submit.textContent = 'Signing you in…';
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    session = data.session;
    if (!session) throw new Error('Sign in did not return a session. Check Supabase Auth settings.');
    await loadDashboard();
  } catch (error) {
    $('#loginError').textContent = error.message || 'Could not sign in.';
    if (session && !loaded) { await sb.auth.signOut(); session = null; }
  } finally { submit.disabled = false; submit.innerHTML = 'Sign in to dashboard <span>↗</span>'; }
}
async function signOut() {
  await sb.auth.signOut(); session = null; orders = []; inventory = []; loaded = false;
  $('#dashboardContent').hidden = true; $('#loginPanel').hidden = false; $('#signOutButton').hidden = true;
  $('.sidebar-user strong').textContent = 'Store admin'; $('.sidebar-user small').textContent = 'Sign in to continue'; $('.admin-avatar').textContent = 'FC';
  toast('You have signed out.', 'success', '#adminToastRegion');
}
async function updateOrderStatus(id) {
  const select = $(`[data-status-select="${CSS.escape(id)}"]`); if (!select) return;
  const button = $(`[data-save-status="${CSS.escape(id)}"]`); const status = select.value;
  button.disabled = true; button.textContent = 'Saving…';
  try {
    const result = await api('/admin/orders', { method:'PATCH', body:JSON.stringify({ id, status }) });
    if (Array.isArray(result) && result.length === 0) throw new Error('No order updated. Check that this account is an admin.');
    const order = orders.find((item) => item.id === id); if (order) order.status = status;
    renderOverview(); renderOrders(); toast(`Order status changed to ${STATUS_LABELS[status]}.`, 'success', '#adminToastRegion');
  } catch (error) { toast(error.message, 'error', '#adminToastRegion'); button.disabled = false; button.textContent = 'Save'; }
}
async function updateProduct(sku) {
  const priceField = $(`[data-product-price="${CSS.escape(sku)}"]`);
  const stockField = $(`[data-product-stock="${CSS.escape(sku)}"]`);
  const activeField = $(`[data-product-active="${CSS.escape(sku)}"]`);
  const button = $(`[data-save-product="${CSS.escape(sku)}"]`);
  const price = Number(priceField?.value); const stock = Number(stockField?.value);
  if (!Number.isFinite(price) || price < 1 || price > 100000 || !Number.isInteger(stock) || stock < 0 || stock > 100000) { toast('Enter a price from ₹1–₹100,000 and stock from 0–100,000.', 'error', '#adminToastRegion'); return; }
  button.disabled = true; button.textContent = 'Saving…';
  try {
    const result = await api('/admin/products', { method:'PATCH', body:JSON.stringify({ sku, price, stock, active:Boolean(activeField?.checked) }) });
    if (Array.isArray(result) && result.length === 0) throw new Error('No product updated. Check that this account is an admin.');
    const product = inventory.find((item) => item.sku === sku); if (product) { product.price = price; product.stock = stock; product.active = Boolean(activeField?.checked); }
    renderOverview(); toast(`${product?.name || sku} saved to Supabase.`, 'success', '#adminToastRegion');
  } catch (error) { toast(error.message, 'error', '#adminToastRegion'); button.disabled = false; button.textContent = 'Save changes'; }
}

$('#loginForm').addEventListener('submit', (event) => { event.preventDefault(); signIn($('#adminEmail').value.trim(), $('#adminPassword').value); });
$('#signOutButton').addEventListener('click', signOut);
$('#refreshButton').addEventListener('click', () => { if (session) loadDashboard(); else toast('Sign in to refresh the dashboard.', 'error', '#adminToastRegion'); });
$$('.sidebar-link').forEach((button) => button.addEventListener('click', () => setView(button.dataset.adminView)));
$$('[data-open-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.openView)));
$('#allOrdersBody').addEventListener('click', (event) => { const button = event.target.closest('[data-save-status]'); if (button) updateOrderStatus(button.dataset.saveStatus); });
$('#inventoryBody').addEventListener('click', (event) => { const button = event.target.closest('[data-save-product]'); if (button) updateProduct(button.dataset.saveProduct); });
$('#orderSearch').addEventListener('input', renderOrders); $('#statusFilter').addEventListener('change', renderOrders);

function boot() {
  if (!window.supabase?.createClient) {
    $('#loginError').textContent = 'Could not load Supabase Auth. Check your network or the Supabase JS CDN.'; return;
  }
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
  sb.auth.getSession().then(({ data }) => { session = data.session; if (session) loadDashboard(); });
  sb.auth.onAuthStateChange((_event, newSession) => { session = newSession; if (session && !loaded) loadDashboard(); });
}
boot();
