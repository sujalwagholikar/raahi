import { CONFIG } from './config.js';
import { loadProducts, createOrder } from './api.js';
import { addToCart, cartCount, clearCart, getCart, removeFromCart, setQuantity, subscribeCart } from './cart.js';
import { money, escapeHTML, toast, openModal, closeModal, debounce } from './ui.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let products = [];
let activeCategory = 'all';
let searchTerm = '';
let activeProduct = null;
let isOrdering = false;

const picture = (p, className = '') => `<img class="${className}" src="${escapeHTML(p.image_url)}" alt="${escapeHTML(p.name)}" loading="lazy" onerror="this.style.opacity='.15'">`;
function productCard(p, index) {
  const discount = p.original_price > p.price ? Math.round((1 - p.price / p.original_price) * 100) : 0;
  return `<article class="product-card" style="--card-index:${Math.min(index, 12)}" data-sku="${escapeHTML(p.sku)}">
    <div class="product-image-area" data-open-product="${escapeHTML(p.sku)}">${picture(p, 'product-image')}${p.badge ? `<span class="product-badge">${escapeHTML(p.badge)}</span>` : ''}${discount ? `<span class="discount-badge">-${discount}%</span>` : ''}<button class="quick-view-button" data-open-product="${escapeHTML(p.sku)}" aria-label="Quick view ${escapeHTML(p.name)}">Quick view <span>↗</span></button></div>
    <div class="product-info"><div class="product-meta"><span>${escapeHTML(p.category)}</span><span class="product-rating">★ ${p.rating.toFixed(1)}</span></div><button class="product-title" data-open-product="${escapeHTML(p.sku)}">${escapeHTML(p.name)}</button><div class="product-unit">${escapeHTML(p.unit)}</div><div class="product-card-bottom"><div class="price-wrap"><strong>${money(p.price)}</strong>${p.original_price > p.price ? `<del>${money(p.original_price)}</del>` : ''}</div><button class="add-button" data-add="${escapeHTML(p.sku)}" aria-label="Add ${escapeHTML(p.name)} to cart"><span>+</span><small>Add</small></button></div></div>
  </article>`;
}
function filteredProducts() {
  let list = products.filter((p) => p.active !== false);
  if (activeCategory !== 'all') list = list.filter((p) => p.category.toLowerCase() === activeCategory.toLowerCase());
  if (searchTerm) list = list.filter((p) => `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const sort = $('#sortSelect')?.value || 'featured';
  if (sort === 'price-asc') list.sort((a,b) => a.price - b.price);
  else if (sort === 'price-desc') list.sort((a,b) => b.price - a.price);
  else if (sort === 'rating') list.sort((a,b) => b.rating - a.rating);
  else list.sort((a,b) => Number(b.featured) - Number(a.featured));
  return list;
}
function renderProducts() {
  const list = filteredProducts();
  $('#productGrid').innerHTML = list.map(productCard).join('');
  $('#emptyState').hidden = list.length !== 0;
  $('#productGrid').hidden = list.length === 0;
  $('#allCount').textContent = products.length;
  $('#resultCount').textContent = `${list.length} ${list.length === 1 ? 'product' : 'products'}`;
}
function activateCategory(category) {
  activeCategory = category;
  $$('.filter-chip').forEach((el) => el.classList.toggle('active', el.dataset.filter === category));
  $('#shop').scrollIntoView({ behavior: 'smooth', block: 'start' }); renderProducts();
}
function findProduct(sku) { return products.find((p) => p.sku === sku); }
function openProduct(sku) {
  const p = findProduct(sku); if (!p) return; activeProduct = p;
  const discount = p.original_price > p.price ? Math.round((1 - p.price / p.original_price) * 100) : 0;
  openModal(`<div class="product-detail-modal"><div class="detail-image">${picture(p, '')}${p.badge ? `<span class="product-badge">${escapeHTML(p.badge)}</span>` : ''}</div><div class="detail-copy"><div class="eyebrow">${escapeHTML(p.category)} <span>·</span> ★ ${p.rating.toFixed(1)}</div><h2 id="modalTitle">${escapeHTML(p.name)}</h2><div class="detail-price">${money(p.price)} ${p.original_price > p.price ? `<del>${money(p.original_price)}</del><span class="save-pill">Save ${discount}%</span>` : ''}</div><p>${escapeHTML(p.description)}</p><div class="detail-unit"><span>Pack size</span><strong>${escapeHTML(p.unit)}</strong></div><div class="detail-freshness"><span>✳</span><div><strong>Freshness you can feel good about</strong><small>Carefully picked and packed for your home.</small></div></div><div class="detail-buy-row"><div class="quantity-stepper"><button data-detail-qty="-1" aria-label="Decrease quantity">−</button><span id="detailQty">1</span><button data-detail-qty="1" aria-label="Increase quantity">+</button></div><button class="button button-primary detail-add-button" data-detail-add="${escapeHTML(p.sku)}">Add to cart · ${money(p.price)} <span>↗</span></button></div><button class="detail-buy-now" data-detail-buy="${escapeHTML(p.sku)}">Buy now</button></div></div>`, (content) => {
    let quantity = 1;
    $$('[data-detail-qty]', content).forEach((btn) => btn.addEventListener('click', () => { quantity = Math.max(1, Math.min(99, quantity + Number(btn.dataset.detailQty))); $('#detailQty', content).textContent = quantity; $('[data-detail-add]', content).innerHTML = `Add to cart · ${money(p.price * quantity)} <span>↗</span>`; }));
    $('[data-detail-add]', content).addEventListener('click', () => { addToCart(p.sku, quantity); toast(`${p.name} added to your basket`); closeModal(); });
    $('[data-detail-buy]', content).addEventListener('click', () => { addToCart(p.sku, quantity); closeModal(); openCart(); setTimeout(openCheckout, 210); });
  });
}
function cartRows() {
  const cart = getCart();
  return Object.entries(cart).map(([sku, quantity]) => ({ product: findProduct(sku), sku, quantity })).filter((item) => item.product);
}
function cartTotals() {
  const rows = cartRows(); const subtotal = rows.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const delivery = subtotal === 0 || subtotal >= CONFIG.freeShippingThreshold ? 0 : CONFIG.shippingFee;
  return { rows, subtotal, delivery, total: subtotal + delivery, count: rows.reduce((n, item) => n + item.quantity, 0) };
}
function renderCart() {
  const { rows, subtotal, delivery, total, count } = cartTotals();
  $('#cartCount').textContent = count; $('#drawerCartCount').textContent = `(${count})`;
  $('#cartEmpty').hidden = rows.length > 0; $('#drawerFooter').hidden = rows.length === 0; $('#cartItems').hidden = rows.length === 0;
  $('#cartItems').innerHTML = rows.map(({ product: p, sku, quantity }) => `<article class="cart-line"><button class="cart-line-image" data-cart-open="${escapeHTML(sku)}">${picture(p, '')}</button><div class="cart-line-copy"><button class="cart-line-title" data-cart-open="${escapeHTML(sku)}">${escapeHTML(p.name)}</button><small>${escapeHTML(p.unit)}</small><strong>${money(p.price * quantity)}</strong><div class="cart-line-controls"><div class="mini-stepper"><button data-cart-qty="-1" data-sku="${escapeHTML(sku)}" aria-label="Decrease quantity">−</button><span>${quantity}</span><button data-cart-qty="1" data-sku="${escapeHTML(sku)}" aria-label="Increase quantity">+</button></div><button class="remove-item" data-remove="${escapeHTML(sku)}">Remove</button></div></div></article>`).join('');
  $('#cartSubtotal').textContent = money(subtotal); $('#cartDelivery').textContent = delivery ? money(delivery) : 'FREE'; $('#cartTotal').textContent = money(total);
  const left = Math.max(0, CONFIG.freeShippingThreshold - subtotal); $('#shippingMessage').textContent = left ? `You’re ${money(left)} away from free delivery` : 'Lovely! You’ve unlocked free delivery'; $('#shippingProgress').style.width = `${Math.min(100, subtotal / CONFIG.freeShippingThreshold * 100)}%`;
}
function openCart() { $('#drawerBackdrop').hidden = false; $('#cartDrawer').classList.add('is-open'); $('#cartDrawer').setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open'); }
function closeCart() { $('#cartDrawer').classList.remove('is-open'); $('#cartDrawer').setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open'); setTimeout(() => { $('#drawerBackdrop').hidden = true; }, 220); }
function openCheckout() {
  const { rows, subtotal, delivery, total } = cartTotals();
  if (!rows.length) { toast('Your basket is empty — add something lovely first.', 'error'); return; }
  closeCart();
  openModal(`<div class="checkout-modal"><div class="eyebrow">ONE LAST LITTLE THING</div><h2 id="modalTitle">Where should we bring the good stuff?</h2><p class="checkout-intro">Add your delivery details to place an order. Demo checkout uses cash on delivery; it does not collect a payment.</p><form id="checkoutForm" class="checkout-form"><div class="form-grid"><label>Full name<input name="customer_name" required maxlength="90" autocomplete="name" placeholder="Your name"></label><label>Phone number<input name="phone" required maxlength="20" autocomplete="tel" inputmode="tel" placeholder="10-digit mobile"></label></div><label>Email <span class="optional-label">(optional)</span><input name="email" type="email" maxlength="180" autocomplete="email" placeholder="you@example.com"></label><label>Address<input name="address_line" required maxlength="180" autocomplete="street-address" placeholder="Flat, building, street"></label><div class="form-grid"><label>City<input name="city" required maxlength="80" autocomplete="address-level2" placeholder="Your city"></label><label>PIN code<input name="pincode" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="postal-code" placeholder="6-digit PIN"></label></div><div class="checkout-summary"><div><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div><span>Delivery</span><strong>${delivery ? money(delivery) : 'FREE'}</strong></div><div class="checkout-grand-total"><span>Total to pay on delivery</span><strong>${money(total)}</strong></div></div><button class="button button-primary checkout-place-button" type="submit">Place order · ${money(total)} <span>↗</span></button><div class="checkout-fineprint"><span>♧</span> Prices are checked on the server. No card or UPI payment is taken.</div><p class="checkout-error" id="checkoutError" role="alert"></p></form></div>`, (content) => {
    $('#checkoutForm', content).addEventListener('submit', async (event) => {
      event.preventDefault(); if (isOrdering) return;
      const form = new FormData(event.currentTarget); const payload = {
        customer_name: String(form.get('customer_name')).trim(), phone: String(form.get('phone')).trim(), email: String(form.get('email') || '').trim(), address_line: String(form.get('address_line')).trim(), city: String(form.get('city')).trim(), pincode: String(form.get('pincode')).trim(), payment_method: 'cod', items: rows.map((row) => ({ sku: row.sku, quantity: row.quantity })),
      };
      isOrdering = true; const button = $('.checkout-place-button', content); button.disabled = true; button.innerHTML = 'Placing your order… <span class="button-loader"></span>';
      try {
        const order = await createOrder(payload);
        const record = Array.isArray(order) ? order[0] : order.order || order;
        clearCart(); closeModal(); showOrderSuccess(record, false);
      } catch (error) {
        // Functional preview fallback: local demo order; it is NOT a real database order.
        const isLocalPreview = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:') && (!error.status || error.status === 404 || error.status === 503);
        if (isLocalPreview) {
          const demoOrder = { order_number: `DEMO-${Date.now().toString().slice(-7)}`, total, subtotal, shipping_fee: delivery, status: 'pending' };
          const saved = JSON.parse(localStorage.getItem('freshcart_demo_orders') || '[]'); saved.unshift({ ...demoOrder, ...payload, created_at: new Date().toISOString(), order_items: rows.map(({ product, quantity }) => ({ product_name: product.name, quantity, unit_price: product.price, line_total: product.price * quantity })) }); localStorage.setItem('freshcart_demo_orders', JSON.stringify(saved)); clearCart(); closeModal(); showOrderSuccess(demoOrder, true);
        } else { $('#checkoutError', content).textContent = `${error.message}. Please try again or contact the store.`; button.disabled = false; button.innerHTML = `Place order · ${money(total)} <span>↗</span>`; }
      } finally { isOrdering = false; }
    });
  });
}
function showOrderSuccess(order, isDemo) {
  const number = order.order_number || order.id || 'FC-ORDER';
  openModal(`<div class="success-modal"><div class="success-check"><svg viewBox="0 0 64 64"><path d="m18 34 9 9 20-23"/></svg></div><div class="eyebrow">${isDemo ? 'LOCAL PREVIEW ORDER' : 'ORDER RECEIVED'}</div><h2 id="modalTitle">That’s a fresh start. ✳</h2><p>${isDemo ? 'Your demo order has been saved only in this browser. Deploy the API + run the Supabase SQL setup to create real shared orders.' : 'Your order is saved. Our team will prepare your basket with care.'}</p><div class="success-order-number"><span>Order reference</span><strong>${escapeHTML(number)}</strong><small>${isDemo ? 'Not visible to the deployed admin panel' : `Status: ${escapeHTML(order.status || 'pending')}`}</small></div><button class="button button-primary" id="continueShopping">Back to the good stuff <span>↗</span></button></div>`, (content) => $('#continueShopping', content).addEventListener('click', closeModal));
}
function showLocationModal() { openModal(`<div class="simple-modal"><div class="eyebrow">DELIVERY, YOUR WAY</div><h2 id="modalTitle">Where’s home?</h2><p>Delivery zones can be tailored to your city. This is a showcase setting for now.</p><form id="locationForm"><label>City or PIN code<input name="location" required placeholder="e.g. Pune or 411001" value=""></label><button type="submit" class="button button-primary">Set delivery location <span>↗</span></button></form></div>`, (content) => $('#locationForm', content).addEventListener('submit', (event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get('location').toString().trim(); $('.location-copy strong').textContent = value; closeModal(); toast(`Delivery location set to ${value}`); })); }
function showAccountModal() { openModal(`<div class="simple-modal"><div class="account-modal-icon">♡</div><div class="eyebrow">YOUR FRESHCART</div><h2 id="modalTitle">A little home for your favourites.</h2><p>Customer accounts are not required for this showcase. Your cart is saved in this browser. Store staff can sign in through the admin panel.</p><button class="button button-primary" id="accountContinue">Keep exploring <span>↗</span></button><p class="account-admin-link"><a href="admin.html">Store team? Go to admin sign in ↗</a></p></div>`, (content) => $('#accountContinue', content).addEventListener('click', closeModal)); }

$('#productGrid').addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]'); if (add) { addToCart(add.dataset.add); const p = findProduct(add.dataset.add); if (p) toast(`${p.name} added to your basket`); add.classList.add('added'); add.innerHTML = '<span>✓</span><small>Added</small>'; setTimeout(() => { if (add.isConnected) { add.classList.remove('added'); add.innerHTML = '<span>+</span><small>Add</small>'; } }, 900); return; }
  const opener = event.target.closest('[data-open-product]'); if (opener) openProduct(opener.dataset.openProduct);
});
$('#categoryGrid').addEventListener('click', (event) => { const card = event.target.closest('[data-category]'); if (card) activateCategory(card.dataset.category); });
$('#filterRow').addEventListener('click', (event) => { const chip = event.target.closest('[data-filter]'); if (chip) activateCategory(chip.dataset.filter); });
$('#sortSelect').addEventListener('change', renderProducts);
$('#searchToggle').addEventListener('click', () => { const panel = $('#searchPanel'); panel.hidden = !panel.hidden; if (!panel.hidden) $('#searchInput').focus(); });
$('#searchInput').addEventListener('input', debounce((event) => { searchTerm = event.target.value.trim(); renderProducts(); if (searchTerm) $('#shop').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 180));
$('#searchPanel').addEventListener('click', (event) => { const btn = event.target.closest('[data-search]'); if (btn) { $('#searchInput').value = btn.dataset.search; searchTerm = btn.dataset.search; $('#searchPanel').hidden = true; renderProducts(); $('#shop').scrollIntoView({ behavior: 'smooth' }); } });
$('#cartButton').addEventListener('click', openCart); $('#closeCart').addEventListener('click', closeCart); $('#drawerBackdrop').addEventListener('click', closeCart); $('#checkoutButton').addEventListener('click', openCheckout); $('#startShopping').addEventListener('click', () => { closeCart(); $('#shop').scrollIntoView({ behavior: 'smooth' }); });
$('#cartItems').addEventListener('click', (event) => { const qty = event.target.closest('[data-cart-qty]'); const remove = event.target.closest('[data-remove]'); const open = event.target.closest('[data-cart-open]'); if (qty) { const sku = qty.dataset.sku; const current = getCart()[sku] || 0; setQuantity(sku, current + Number(qty.dataset.cartQty)); } else if (remove) removeFromCart(remove.dataset.remove); else if (open) { closeCart(); openProduct(open.dataset.cartOpen); } });
$('#locationButton').addEventListener('click', showLocationModal); $('#accountButton').addEventListener('click', showAccountModal);
$('#modalClose').addEventListener('click', closeModal); $('#modalLayer').addEventListener('click', (event) => { if (event.target === $('#modalLayer')) closeModal(); });
$('#clearFilters').addEventListener('click', () => { activeCategory = 'all'; searchTerm = ''; $('#searchInput').value = ''; $$('.filter-chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.filter === 'all')); renderProducts(); });
$('#newsletterForm').addEventListener('submit', (event) => { event.preventDefault(); const email = $('#newsletterEmail').value.trim(); if (email) { toast('You’re on the list — look out for the good stuff!'); event.currentTarget.reset(); } });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModal(); closeCart(); $('#searchPanel').hidden = true; } });
subscribeCart(renderCart);
(async function init() { $('#yearNow').textContent = new Date().getFullYear(); products = await loadProducts(); renderProducts(); renderCart(); document.querySelectorAll('.product-card').forEach((card, i) => card.style.animationDelay = `${i * 35}ms`); })();
