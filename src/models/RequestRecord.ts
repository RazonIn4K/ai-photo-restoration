import { Schema, model, type Document } from 'mongoose';
import { ulid } from 'ulid';

import type { 
  RequestStatus, 
  IntentCategory, 
  PhotoAsset, 
  ProcessingMetadata, 
  PostingProofBundle 
} from '../types/index.js';

export interface IRequestRecord extends Document {
  requestId: string;
  facebookPostId: string;
  facebookGroupId: string;
  posterName: string;
  posterFacebookId?: string;
  postUrl: string;
  userRequest: string;
  
  // Multi-photo support
  assets: PhotoAsset[];
  
  // Processing metadata
  intentCategory?: IntentCategory;
  classificationConfidence?: number;
  routingDecision?: 'local' | 'cloud' | 'triage';
  
  // Status tracking
  status: RequestStatus;
  queuedAt?: Date;
  processedAt?: Date;
  reviewedAt?: Date;
  postedAt?: Date;
  
  // Processing results
  processingMetadata?: ProcessingMetadata;
  
  // Approval workflow
  reviewedBy?: string;
  approvalNotes?: string;
  
  // Posting proof
  postingProof?: PostingProofBundle;
  
  // Audit trail
  createdAt: Date;
  updatedAt: Date;
}

const PhotoAssetSchema = new Schema({
  assetId: {
    type: String,
    required: true,
    default: () => ulid()
  },
  originalImageUrl: {
    type: String,
    required: true
  },
  originalImageHash: {
    type: String,
    required: true,
    index: true
  },
  originalImagePath: {
    type: String,
    required: true
  },
  restoredImageUrl: {
    type: String
  },
  restoredImageHash: {
    type: String,
    index: true
  },
  restoredImagePath: {
    type: String
  },
  perceptualHash: {
    type: String,
    required: true,
    index: true
  },
  restoredPerceptualHash: {
    type: String
  },
  selected: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const ProcessingMetadataSchema = new Schema({
  modelUsed: {
    type: String,
    required: true
  },
  cost: {
    type: Number,
    min: 0
  },
  appliedEffects: [{
    type: String
  }],
  processingTimeMs: {
    type: Number,
    min: 0
  },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 1
  }
}, { _id: false });

const PostingProofBundleSchema = new Schema({
  commentUrl: {
    type: String,
    required: true
  },
  postedAt: {
    type: Date,
    required: true
  },
  screenshotPath: {
    type: String
  },
  c2paManifestPath: {
    type: String,
    required: true
  },
  waczPath: {
    type: String
  },
  verifierSignature: {
    type: String,
    required: true
  },
  notes: {
    type: String
  }
}, { _id: false });

const RequestRecordSchema = new Schema<IRequestRecord>(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      default: () => ulid(),
      index: true
    },
    facebookPostId: {
      type: String,
      required: true,
      index: true
    },
    facebookGroupId: {
      type: String,
      required: true,
      index: true
    },
    posterName: {
      type: String,
      required: true
    },
    posterFacebookId: {
      type: String,
      index: true
    },
    postUrl: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userRequest: {
      type: String,
      required: true
    },
    assets: {
      type: [PhotoAssetSchema],
      required: true,
      validate: {
        validator: function(assets: PhotoAsset[]) {
          return assets.length > 0;
        },
        message: 'At least one photo asset is required'
      }
    },
    intentCategory: {
      type: String,
      enum: ['simple_enhance', 'colorize_only', 'restore_heavy_damage', 'custom_request']
    },
    classificationConfidence: {
      type: Number,
      min: 0,
      max: 1
    },
    routingDecision: {
      type: String,
      enum: ['local', 'cloud', 'triage']
    },
    status: {
      type: String,
      required: true,
      default: 'queued',
      enum: [
        'queued',
        'processing',
        'awaiting_manual_approval',
        'approved_pending_post',
        'rejected',
        'completed',
        'failed'
      ],
      index: true
    },
    queuedAt: {
      type: Date,
      index: true
    },
    processedAt: {
      type: Date
    },
    reviewedAt: {
      type: Date
    },
    postedAt: {
      type: Date
    },
    processingMetadata: {
      type: ProcessingMetadataSchema
    },
    reviewedBy: {
      type: String,
      index: true
    },
    approvalNotes: {
      type: String
    },
    postingProof: {
      type: PostingProofBundleSchema
    }
  },
  {
    timestamps: true,
    collection: 'requests'
  }
);

// Compound indexes for efficient queries
RequestRecordSchema.index({ status: 1, queuedAt: 1 });
RequestRecordSchema.index({ facebookGroupId: 1, createdAt: -1 });
RequestRecordSchema.index({ reviewedBy: 1, reviewedAt: -1 });
RequestRecordSchema.index({ 'assets.originalImageHash': 1 });
RequestRecordSchema.index({ 'assets.restoredImageHash': 1 });

// Virtual for getting selected assets
RequestRecordSchema.virtual('selectedAssets').get(function() {
  return this.assets.filter(asset => asset.selected);
});

// Instance method to update status with automatic timestamp
RequestRecordSchema.methods.updateStatus = function(newStatus: RequestStatus, operatorId?: string) {
  this.status = newStatus;
  
  switch (newStatus) {
    case 'queued':
      this.queuedAt = new Date();
      break;
    case 'processing':
      this.processedAt = new Date();
      break;
    case 'awaiting_manual_approval':
      this.processedAt = this.processedAt || new Date();
      break;
    case 'approved_pending_post':
    case 'rejected':
      this.reviewedAt = new Date();
      this.reviewedBy = operatorId;
      break;
    case 'completed':
      this.postedAt = new Date();
      break;
  }
  
  return this.save();
};

// Static method to find requests by status with pagination
RequestRecordSchema.statics.findByStatus = function(
  status: RequestStatus, 
  options: { limit?: number; skip?: number; sort?: any } = {}
) {
  const { limit = 50, skip = 0, sort = { createdAt: -1 } } = options;
  
  return this.find({ status })
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

export const RequestRecordModel = model<IRequestRecord>('RequestRecord', RequestRecordSchema);