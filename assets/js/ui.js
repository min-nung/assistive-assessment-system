/* Shared UI helpers.
+ * Mechanically extracted from index_2.html. Keep public function names stable while modularizing.
 */
/* ==========================================================================
   Toast & indicators
   ========================================================================== */
let toastTimer;

function hideToast() {
  const t = document.getElementById('toast');
  if (t) t.classList.remove('show');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  // Assigning textContent also clears any button left behind by an earlier
  // showActionToast(), so a plain message can never inherit a stale action.
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/**
 * A toast carrying one action, used for "undo that" moments.
 *
 * Stays up far longer than a plain toast: the point is to be there when the
 * user realises what they just did, and noticing a mistake takes longer than
 * reading a confirmation. Dismissing itself on a timer is still right — this
 * is an offer, not a question that must be answered.
 *
 * @param {string} message What just happened
 * @param {string} actionLabel The button's text
 * @param {Function} onAction Run when the button is pressed
 * @param {number} [durationMs] How long the offer stands
 */
function showActionToast(message, actionLabel, onAction, durationMs = 8000) {
  const t = document.getElementById('toast');
  if (!t) return;
  const text = document.createElement('span');
  text.textContent = message;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toast-action';
  button.textContent = actionLabel;
  button.addEventListener('click', () => {
    clearTimeout(toastTimer);
    hideToast();
    onAction();
  });
  t.replaceChildren(text, button);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, durationMs);
}

let saveTimer;
function showSaved() {}

export { showToast, showActionToast, showSaved };
