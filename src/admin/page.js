// Loaded on every admin page. The admin's Content Security Policy forbids
// inline handlers, so behaviour the public menu writes inline lives here.

// A photo that fails to load removes itself, so the coloured placeholder
// behind it shows, exactly as on the public menu.
function dropBrokenImage(image) {
  image.closest('[data-image]')?.classList.remove('has-image');
  image.remove();
}
document.addEventListener('error', (event) => {
  if (event.target instanceof HTMLImageElement && event.target.closest('[data-image]')) dropBrokenImage(event.target);
}, true);
for (const image of document.querySelectorAll('[data-image] img')) {
  if (image.complete && image.naturalWidth === 0) dropBrokenImage(image);
}

// Server-rendered forms say what they are doing and cannot be sent twice.
document.addEventListener('submit', (event) => {
  const button = event.submitter ?? event.target.querySelector('[type="submit"]');
  if (!button?.dataset.pendingLabel || event.defaultPrevented) return;
  if (button.dataset.pending) {
    event.preventDefault();
    return;
  }
  button.dataset.pending = 'true';
  button.setAttribute('aria-disabled', 'true');
  button.textContent = button.dataset.pendingLabel;
});
// Returning with the back button must not leave a button stuck on "Signing in…".
window.addEventListener('pageshow', (event) => {
  if (event.persisted && document.querySelector('[data-pending]')) window.location.reload();
});

for (const toggle of document.querySelectorAll('[data-show-password]')) {
  const field = document.getElementById(toggle.dataset.showPassword);
  toggle.addEventListener('change', () => { field.type = toggle.checked ? 'text' : 'password'; });
}
