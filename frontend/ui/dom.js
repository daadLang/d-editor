export function byId(id) {
  return document.getElementById(id);
}

export function setHidden(element, hidden) {
  element?.classList.toggle('view-hidden', hidden);
}

export function setBusy(button, busy, busyLabel = 'جارٍ التنفيذ...') {
  if (!button) return;
  if (busy) {
    button.dataset.idleLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    button.textContent = button.dataset.idleLabel || button.textContent;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

export function showNotice(message, type = 'info') {
  const notice = document.createElement('div');
  notice.className = `app-notice app-notice-${type}`;
  notice.textContent = message;
  document.body.appendChild(notice);
  requestAnimationFrame(() => notice.classList.add('visible'));
  window.setTimeout(() => {
    notice.classList.remove('visible');
    window.setTimeout(() => notice.remove(), 180);
  }, 3200);
}