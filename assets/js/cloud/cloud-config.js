/* Cloud backup configuration.
 *
 * The Client ID below is public information and is meant to ship in frontend
 * code — that is how Google designs browser OAuth. The real boundary is the
 * "Authorized JavaScript origins" list on the OAuth client: even with this ID,
 * a third party cannot use it from another domain.
 *
 * The Client Secret is a different matter and must never appear here, anywhere
 * else in frontend code, or in the repository. The browser token flow does not
 * need it. See docs/google-cloud-setup.md.
 */
const CLOUD_CONFIG = Object.freeze({
  clientId: '398998545967-pk914ui6j6m079opgor9bc1ekmania30.apps.googleusercontent.com',

  /* Only files this app itself created. Deliberately not the full `drive`
   * scope: case data lives in the therapist's own account and the app has no
   * business reading the rest of their Drive. */
  scope: 'https://www.googleapis.com/auth/drive.file',

  /* Google Identity Services is loaded on demand rather than from a script tag
   * in index.html, so that going offline never triggers a failed request for a
   * third-party script. Assessment work must not depend on this being
   * reachable. */
  gisUrl: 'https://accounts.google.com/gsi/client',

  /* localStorage keys. The prefix matches the existing keys in core/state.js. */
  linkedEmailKey: 'stairAssessmentCloudLinkedEmail.v1',
  lastUploadedAtKey: 'stairAssessmentCloudLastUploadedAt.v1',
  lastChangedAtKey: 'stairAssessmentCloudLastChangedAt.v1',
  staleReminderKey: 'stairAssessmentCloudStaleReminderAt.v1',

  /* Whether this device is a view-only device — see cloud/read-only.js. Stored
   * per device and deliberately never travels inside a snapshot: it describes
   * the role this browser plays, not the data. */
  readOnlyKey: 'stairAssessmentCloudReadOnly.v1',
  readOnlyPulledAtKey: 'stairAssessmentCloudReadOnlyPulledAt.v1',

  /* Matches core/state.js's BACKUP_REMINDER_DAYS: Google's own test-mode
   * token lifetime is about 7 days, so this is the same window a therapist
   * would otherwise go silently unprotected for if cloud backup quietly
   * stopped and nothing said so. */
  staleReminderDays: 7
});

export { CLOUD_CONFIG };
