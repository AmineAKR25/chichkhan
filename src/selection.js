// "Ma sélection": a private running total kept on this phone. It is never sent
// anywhere; it is not an order. Amounts are integer millimes to avoid float drift.
const plus = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const minus = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';

export function initSelection(menu) {
  const storageKey = `menu-selection:${menu.slug}`;
  // Keyed by the database item id, so reordering the menu keeps saved lists valid.
  const items = new Map();
  for (const category of menu.categories)
    for (const item of category.items) items.set(String(item.id), { ...item, category: category.name });

  let quantities = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    quantities = new Map(Object.entries(saved).filter(([key, qty]) => items.has(key) && Number.isInteger(qty) && qty > 0));
  } catch { /* storage unavailable: the selection simply lasts for this visit */ }
  const save = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(quantities))); } catch { /* ignore */ }
  };

  const formatMillimes = (millimes) => (millimes / 1000).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const priceMarkup = (millimes) => {
    const [dinars, rest] = formatMillimes(millimes).split(',');
    return `${dinars}<span class="millimes">,${rest}</span> <small>DT</small>`;
  };
  const articles = (n) => `${n} article${n === 1 ? '' : 's'}`;
  const escapeHtml = (value) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const bar = document.querySelector('#selection-bar');
  const dialog = document.querySelector('#selection-dialog');
  const lines = document.querySelector('#selection-lines');
  const status = document.querySelector('#selection-status');
  const clear = document.querySelector('#clear-selection');
  const openButton = document.querySelector('#open-selection');
  const buttons = new Map();

  for (const section of document.querySelectorAll('.menu-section')) {
    for (const row of section.querySelectorAll('.dish')) {
      const key = row.dataset.itemId;
      if (!items.has(key)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'add-item';
      button.dataset.key = key;
      row.querySelector('.dish-heading').append(button);
      buttons.set(key, button);
    }
  }

  function totals() {
    let count = 0;
    let millimes = 0;
    for (const [key, qty] of quantities) {
      count += qty;
      millimes += items.get(key).millimes * qty;
    }
    return { count, millimes };
  }

  function render() {
    const { count, millimes } = totals();
    for (const [key, button] of buttons) {
      const qty = quantities.get(key) || 0;
      const name = items.get(key).name;
      button.innerHTML = qty ? `<span aria-hidden="true">${qty}</span>` : plus;
      button.classList.toggle('is-selected', qty > 0);
      button.setAttribute('aria-label', qty ? `${name} : ${qty} dans ma sélection. Ajouter encore un` : `Ajouter ${name} à ma sélection`);
    }
    bar.hidden = count === 0;
    document.body.classList.toggle('has-selection', count > 0);
    document.querySelector('#selection-count').textContent = articles(count);
    document.querySelector('#selection-bar-total').innerHTML = priceMarkup(millimes);
    document.querySelector('#selection-summary-count').textContent = articles(count);
    document.querySelector('#selection-total').innerHTML = priceMarkup(millimes);
    lines.innerHTML = [...quantities].map(([key, qty]) => {
      const item = items.get(key);
      const name = escapeHtml(item.name);
      return `<li data-key="${key}"><div class="selection-name"><strong>${name}</strong><small>${escapeHtml(item.category)} · ${formatMillimes(item.millimes)} DT</small></div><div class="stepper"><button type="button" data-step="-1" aria-label="Retirer un ${name}">${minus}</button><span aria-label="Quantité">${qty}</span><button type="button" data-step="1" aria-label="Ajouter un ${name}">${plus}</button></div><span class="price">${priceMarkup(item.millimes * qty)}</span></li>`;
    }).join('');
    if (!count && dialog.open) dialog.close();
  }

  function change(key, step) {
    const qty = (quantities.get(key) || 0) + step;
    if (qty > 0) quantities.set(key, qty);
    else quantities.delete(key);
    save();
    render();
    const { count, millimes } = totals();
    status.textContent = `${items.get(key).name} : ${Math.max(qty, 0)}. ${articles(count)}, ${formatMillimes(millimes)} DT.`;
  }

  document.addEventListener('click', (event) => {
    const add = event.target.closest('.add-item');
    if (add) {
      change(add.dataset.key, 1);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        bar.animate?.([{ transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
      return;
    }
    const step = event.target.closest('[data-step]');
    if (step) {
      const line = step.closest('li');
      const key = line.dataset.key;
      const direction = Number(step.dataset.step);
      change(key, direction);
      // Keep keyboard focus inside the sheet after the list re-renders.
      const next = lines.querySelector(`li[data-key="${key}"] [data-step="${direction}"]`) || lines.querySelector('[data-step]') || clear;
      next?.focus();
    }
  });

  openButton.addEventListener('click', () => {
    resetClear();
    dialog.showModal();
    document.querySelector('#close-selection').focus();
  });
  const closeSheet = () => {
    if (dialog.open) dialog.close();
  };
  dialog.addEventListener('close', () => { if (!bar.hidden) openButton.focus({ preventScroll: true }); });
  document.querySelector('#close-selection').addEventListener('click', closeSheet);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSheet();
  });

  // Emptying the whole list asks for a second tap.
  let confirmTimer;
  function resetClear() {
    clearTimeout(confirmTimer);
    clear.dataset.confirm = '';
    clear.textContent = 'Vider la sélection';
  }
  clear.addEventListener('click', () => {
    if (!clear.dataset.confirm) {
      clear.dataset.confirm = 'yes';
      clear.textContent = 'Confirmer : tout retirer';
      confirmTimer = setTimeout(resetClear, 4000);
      return;
    }
    resetClear();
    quantities.clear();
    save();
    render();
    status.textContent = 'Sélection vidée.';
  });

  render();
}
