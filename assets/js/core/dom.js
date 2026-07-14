/** HTML / attribute escaping and deterministic DOM identifier helpers. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

export function escapeAttr(value) {
  if (value === null || value === undefined || value === '') return '';
  return escapeHtml(value);
}

export function domIdToken(value) {
  return Array.from(String(value), char => char.codePointAt(0).toString(36)).join('-');
}
