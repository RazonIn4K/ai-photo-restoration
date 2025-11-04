import { Schema, model, type Document } from 'mongoose';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';

import { validateRequestId, validateOperatorId } from '../lib/validation.js';
import type { ActionType } from '../types/index.js';

export interface IActionLog extends Document {
  logId: string;
  requestId: string;
  action: ActionType;
  operatorId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  previousHash?: string; // For tamper-evident chain
  currentHash: string;
  rekorLogIndex?: number; // External transparency log anchor
  timestampProof?: string; // OpenTimestamps proof
  createdAt: Date;
  updatedAt: Date;
}

const ActionLogSchema = new Schema<IActionLog>(
  {
    logId: {
      type: String,
      required: true,
      unique: true,
      default: () => ulid(),
      index: true
    },
    requestId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: validateRequestId,
        message: 'Request ID must be a valid ULID'
      }
    },
    action: {
      type: String,
      required: true,
      enum: ['ingested', 'classified', 'restored', 'approved', 'rejected', 'posted', 'requeued']
    },
    operatorId: {
      type: String,
      index: true,
      validate: {
        validator: function (value: string) {
          return !value || validateOperatorId(value);
        },
        message: 'Operator ID must be alphanumeric with dashes/underscores, 3-50 characters'
      }
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    previousHash: {
      type: String
    },
    currentHash: {
      type: String,
      required: true
    },
    rekorLogIndex: {
      type: Number
    },
    timestampProof: {
      type: String
    }
  },
  {
    timestamps: true,
    collection: 'actionlogs'
  }
);

// Compound indexes for efficient queries
ActionLogSchema.index({ requestId: 1, timestamp: -1 });
ActionLogSchema.index({ timestamp: -1 });
ActionLogSchema.index({ action: 1, timestamp: -1 });

// Pre-save middleware to compute hash for tamper-evident chain
ActionLogSchema.pre('save', async function (next) {
  if (this.isNew) {
    // Find the most recent log entry for this specific request to get previous hash
    const lastLog = await ActionLogModel.findOne(
      { requestId: this.requestId },
      {},
      { sort: { timestamp: -1 } }
    );
    this.previousHash = lastLog?.currentHash;

    // Compute current hash from log content
    const hashInput = JSON.stringify({
      logId: this.logId,
      requestId: this.requestId,
      action: this.action,
      operatorId: this.operatorId,
      timestamp: this.timestamp,
      metadata: this.metadata,
      previousHash: this.previousHash
    });

    this.currentHash = createHash('sha256').update(hashInput).digest('hex');
  }
  next();
});

// Static method to verify hash chain integrity for a specific request
ActionLogSchema.statics.verifyHashChain = async function (
  requestId: string,
  startDate?: Date,
  endDate?: Date
) {
  const query: Record<string, unknown> = { requestId };
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = startDate;
    if (endDate) query.timestamp.$lte = endDate;
  }

  const logs = await this.find(query).sort({ timestamp: 1 });

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const expectedPreviousHash = i > 0 ? logs[i - 1].currentHash : undefined;

    if (log.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        brokenAt: log.logId,
        message: `Hash chain broken at log ${log.logId} for request ${requestId}`
      };
    }

    // Verify current hash
    const hashInput = JSON.stringify({
      logId: log.logId,
      requestId: log.requestId,
      action: log.action,
      operatorId: log.operatorId,
      timestamp: log.timestamp,
      metadata: log.metadata,
      previousHash: log.previousHash
    });

    const expectedHash = createHash('sha256').update(hashInput).digest('hex');
    if (log.currentHash !== expectedHash) {
      return {
        valid: false,
        brokenAt: log.logId,
        message: `Hash mismatch at log ${log.logId} for request ${requestId}`
      };
    }
  }

  return { valid: true, verifiedCount: logs.length, requestId };
};

export const ActionLogModel = model<IActionLog>('ActionLog', ActionLogSchema);
