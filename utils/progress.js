'use strict';
// Where a case is on the four-step path shown on the case page and in "My cases":
// reported, under review, approved, handed over. A pure function of the case, so views and tests
// share one rule. Locale keys come from this file (progress_*) and from config/statuses (status_*).
const { CASE } = require('../config/statuses');

const STEPS = ['progress_reported', 'progress_review', 'progress_approved', 'progress_handed'];
const LAST = STEPS.length - 1;

// The step that is in progress for each live status.
const CURRENT = {
  [CASE.PENDING_APPROVAL]: 1,
  [CASE.UNDER_REVIEW]: 1,
  [CASE.OPEN]: 2,
  [CASE.MATCHED]: 2,
  [CASE.CLAIM_PENDING]: 2,
  [CASE.READY]: 3
};

const accepted = (c) => Boolean(c && c.review && c.review.decision === 'accepted');

// Returns { steps: [{ key, state }], position, total, finished, stopped, stoppedKey, detailKey }.
// state is complete | current | upcoming | stopped. A stopped case (rejected, withdrawn, disposed)
// keeps its earlier steps complete and shows the reason in place of the step it never reached.
function progressFor(c) {
  const status = c && c.status;
  let current = null;
  let stoppedAt = null;
  let stoppedKey = null;

  if (status === CASE.CLOSED && (c.closeReason === 'returned' || c.closeReason === 'recovered')) {
    current = STEPS.length; // everything is done
  } else if (status === CASE.CLOSED) {
    stoppedAt = accepted(c) ? LAST : 1; // withdrawn: before or after the Security Cell accepted it
    stoppedKey = `close_${c.closeReason || 'withdrawn'}`;
  } else if (status === CASE.REJECTED) {
    stoppedAt = 1;
    stoppedKey = 'status_rejected';
  } else if (status === CASE.DISPOSED) {
    stoppedAt = LAST;
    stoppedKey = 'status_disposed';
  } else {
    current = Object.prototype.hasOwnProperty.call(CURRENT, status) ? CURRENT[status] : 0; // unknown: show as reported
  }

  const steps = STEPS.map((key, i) => {
    let state = 'upcoming';
    if (stoppedAt !== null) {
      if (i < stoppedAt) state = 'complete';
      else if (i === stoppedAt) state = 'stopped';
    } else if (i < current) state = 'complete';
    else if (i === current) state = 'current';
    return { key: stoppedAt === i ? stoppedKey : key, state };
  });

  const finished = current === STEPS.length;
  const index = stoppedAt !== null ? stoppedAt : (finished ? LAST : current);
  return {
    steps,
    position: index + 1,
    total: STEPS.length,
    finished,
    stopped: stoppedAt !== null,
    // The finer status of the step in progress, such as "Claim being checked".
    detailKey: stoppedAt === null && !finished && Object.prototype.hasOwnProperty.call(CURRENT, status) ? `status_${status}` : null
  };
}

module.exports = { progressFor, STEPS };
