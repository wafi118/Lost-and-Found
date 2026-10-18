'use strict';
// Case, claim and account states, in one place so controllers, services and views agree.

const CASE = Object.freeze({
  PENDING_APPROVAL: 'pending_approval',
  REJECTED: 'rejected',
  UNDER_REVIEW: 'under_review',
  OPEN: 'open',
  MATCHED: 'matched',
  CLAIM_PENDING: 'claim_pending',
  READY: 'ready_for_handover',
  CLOSED: 'closed',
  DISPOSED: 'disposed'
});

// Only these appear on the public feed.
const PUBLIC_VISIBLE = [CASE.OPEN, CASE.MATCHED];
// Still in progress (not finished either way).
const ACTIVE = [CASE.PENDING_APPROVAL, CASE.UNDER_REVIEW, CASE.OPEN, CASE.MATCHED, CASE.CLAIM_PENDING, CASE.READY];
// A found item is physically at the Security Cell in these states.
const IN_CUSTODY = [CASE.OPEN, CASE.MATCHED, CASE.CLAIM_PENDING, CASE.READY];

const CASE_TONE = {
  pending_approval: 'amber', rejected: 'red', under_review: 'blue', open: 'teal', matched: 'indigo',
  claim_pending: 'blue', ready_for_handover: 'green', closed: 'gray', disposed: 'gray'
};

const CLAIM = Object.freeze({
  SUBMITTED: 'submitted',
  PROOF_REQUESTED: 'proof_requested',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  COMPLETED: 'completed'
});
const CLAIM_ACTIVE = [CLAIM.SUBMITTED, CLAIM.PROOF_REQUESTED, CLAIM.VERIFIED];
const CLAIM_TONE = { submitted: 'blue', proof_requested: 'amber', verified: 'green', rejected: 'red', completed: 'gray' };

const USER = Object.freeze({ PENDING: 'pending', ACTIVE: 'active', SUSPENDED: 'suspended' });
const USER_TONE = { pending: 'amber', active: 'green', suspended: 'red' };

// How an account proved that its owner belongs to BUP (AUTH-8). University e-mail is the default.
const VERIFY = Object.freeze({ EMAIL: 'university_email', ID_CARD: 'id_card' });
// One ID card photo sent for review. `submitted` waits for an administrator.
const ID_PROOF = Object.freeze({ SUBMITTED: 'submitted', APPROVED: 'approved', REJECTED: 'rejected' });
const ID_PROOF_TONE = { submitted: 'amber', approved: 'green', rejected: 'red' };
// Why an administrator may reject a photo. Each has a locale key id_reason_<code>.
const ID_REJECT_REASONS = Object.freeze(['unreadable', 'name_mismatch', 'id_mismatch', 'not_bup_card', 'other']);

module.exports = { CASE, PUBLIC_VISIBLE, ACTIVE, IN_CUSTODY, CASE_TONE, CLAIM, CLAIM_ACTIVE, CLAIM_TONE, USER, USER_TONE, VERIFY, ID_PROOF, ID_PROOF_TONE, ID_REJECT_REASONS };
