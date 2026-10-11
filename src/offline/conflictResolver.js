// Conflict = the server answered 409 (e.g. "file already exists").
// We never overwrite anything: the op is parked and the user decides.
import { updateOp, removeOp } from './outboxQueue';

export const markConflict = (op, message) =>
  updateOp(op.opId, { status: 'conflict', lastError: message || 'Already exists on the server.' });

export const retryOp = (op) => updateOp(op.opId, { status: 'pending', attempts: 0, lastError: null });
export const discardOp = (op) => removeOp(op.opId);