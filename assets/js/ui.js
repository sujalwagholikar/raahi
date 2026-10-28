export const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
export const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function toast(message, kind = 'success', host = '#toastRegion') {
  const region = document.querySelector(host); if (!region) return;
  const node = document.createElement('div'); node.className = `toast toast-${kind}`; node.innerHTML = `<span class="toast-symbol">${kind === 'error' ? '!' : '✓'}</span><span>${escapeHTML(message)}</span>`;
  region.append(node); requestAnimationFrame(() => node.classList.add('is-visible')); window.setTimeout(() => { node.classList.remove('is-visible'); window.setTimeout(() => node.remove(), 220); }, 3300);
}
let modalCloseTimer = null;
export function openModal(markup, onReady) {
  window.clearTimeout(modalCloseTimer);
  const layer = document.querySelector('#modalLayer'); const content = document.querySelector('#modalContent');
  if (!layer || !content) return;
  content.innerHTML = markup; layer.hidden = false; document.body.classList.add('modal-open'); requestAnimationFrame(() => layer.classList.add('is-open'));
  onReady?.(content);
}
export function closeModal() {
  const layer = document.querySelector('#modalLayer'); if (!layer) return;
  window.clearTimeout(modalCloseTimer);
  layer.classList.remove('is-open'); document.body.classList.remove('modal-open');
  modalCloseTimer = window.setTimeout(() => { layer.hidden = true; document.querySelector('#modalContent').innerHTML = ''; }, 180);
}
export const debounce = (fn, wait = 160) => { let timer; return (...args) => { window.clearTimeout(timer); timer = window.setTimeout(() => fn(...args), wait); }; };
