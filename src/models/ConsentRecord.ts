import { Schema, model, type Document } from 'mongoose';

import type { ConsentStatus, ConsentMethod } from '../types/index.js';

export interface IConsentRecord extends Document {
  facebookUserId: string;
  consentStatus: ConsentStatus;
  consentGivenAt?: Date;
  consentMethod: ConsentMethod;
  optOutReason?: string;
  dataRetentionDays: number;
  createdAt: Date;
  updatedAt: Date;
}

const ConsentRecordSchema = new Schema<IConsentRecord>(
  {
    facebookUserId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    consentStatus: {
      type: String,
      required: true,
      enum: ['opted_in', 'opted_out', 'unknown'],
      default: 'unknown',
      index: true
    },
    consentGivenAt: {
      type: Date,
      index: true
    },
    consentMethod: {
      type: String,
      required: true,
      enum: ['implicit', 'explicit'],
      default: 'implicit'
    },
    optOutReason: {
      type: String
    },
    dataRetentionDays: {
      type: Number,
      required: true,
      default: 90,
      min: 1,
      max: 2555 // ~7 years maximum
    }
  },
  {
    timestamps: true,
    collection: 'consents'
  }
);

// Compound indexes for efficient queries
ConsentRecordSchema.index({ consentStatus: 1, consentGivenAt: -1 });
ConsentRecordSchema.index({ consentStatus: 1, updatedAt: -1 });

// Instance method to update consent status
ConsentRecordSchema.methods.updateConsent = function(
  status: ConsentStatus, 
  method: ConsentMethod = 'explicit',
  optOutReason?: string
) {
  this.consentStatus = status;
  this.consentMethod = method;
  this.consentGivenAt = new Date();
  
  if (status === 'opted_out' && optOutReason) {
    this.optOutReason = optOutReason;
  }
  
  return this.save();
};

// Static method to check if user has valid consent
ConsentRecordSchema.statics.hasValidConsent = async function(facebookUserId: string) {
  const consent = await this.findOne({ facebookUserId });
  
  if (!consent) {
    return { hasConsent: false, status: 'unknown' as ConsentStatus };
  }
  
  return {
    hasConsent: consent.consentStatus === 'opted_in',
    status: consent.consentStatus,
    consentGivenAt: consent.consentGivenAt,
    method: consent.consentMethod
  };
};

// Static method to find users whose data should be deleted based on retention policy
ConsentRecordSchema.statics.findExpiredConsents = function(referenceDate: Date = new Date()) {
  return this.aggregate([
    {
      $match: {
        consentStatus: { $in: ['opted_out', 'unknown'] }
      }
    },
    {
      $addFields: {
        expirationDate: {
          $add: [
            '$updatedAt',
            { $multiply: ['$dataRetentionDays', 24 * 60 * 60 * 1000] }
          ]
        }
      }
    },
    {
      $match: {
        $expr: {
          $lte: ['$expirationDate', referenceDate]
        }
      }
    },
    {
      $project: {
        facebookUserId: 1,
        consentStatus: 1,
        dataRetentionDays: 1,
        updatedAt: 1,
        expirationDate: 1
      }
    }
  ]);
};

// Static method to create or update consent record
ConsentRecordSchema.statics.upsertConsent = function(
  facebookUserId: string,
  status: ConsentStatus,
  method: ConsentMethod = 'implicit',
  optOutReason?: string,
  dataRetentionDays: number = 90
) {
  const updateData: any = {
    consentStatus: status,
    consentMethod: method,
    consentGivenAt: new Date(),
    dataRetentionDays
  };
  
  if (status === 'opted_out' && optOutReason) {
    updateData.optOutReason = optOutReason;
  }
  
  return this.findOneAndUpdate(
    { facebookUserId },
    updateData,
    { 
      upsert: true, 
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

export const ConsentRecordModel = model<IConsentRecord>('ConsentRecord', ConsentRecordSchema);