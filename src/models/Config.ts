import { Schema, model, type Document } from 'mongoose';

import type { GroupConfig, VersionedSelectors } from '../types/index.js';

export interface IConfig extends Document {
  configKey: string;
  configValue: any;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGroupConfig extends Document {
  groupId: string;
  groupName?: string;
  selectors: VersionedSelectors;
  keywords: string[];
  lastScanTimestamp: Date;
  extractionMethod: 'playwright' | 'zyte' | 'hybrid';
  canarySchedule: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VersionedSelectorsSchema = new Schema({
  version: {
    type: String,
    required: true
  },
  selectors: {
    type: Schema.Types.Mixed,
    required: true,
    default: {}
  },
  lastUpdated: {
    type: Date,
    required: true,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true
  }
}, { _id: false });

const ConfigSchema = new Schema<IConfig>(
  {
    configKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    configValue: {
      type: Schema.Types.Mixed,
      required: true
    },
    description: {
      type: String
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'configs'
  }
);

const GroupConfigSchema = new Schema<IGroupConfig>(
  {
    groupId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    groupName: {
      type: String
    },
    selectors: {
      type: VersionedSelectorsSchema,
      required: true
    },
    keywords: [{
      type: String,
      required: true
    }],
    lastScanTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    extractionMethod: {
      type: String,
      required: true,
      enum: ['playwright', 'zyte', 'hybrid'],
      default: 'playwright'
    },
    canarySchedule: {
      type: String,
      required: true,
      default: '0 */6 * * *' // Every 6 hours
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'groupconfigs'
  }
);

// Compound indexes for efficient queries
ConfigSchema.index({ isActive: 1, configKey: 1 });
GroupConfigSchema.index({ isActive: 1, lastScanTimestamp: -1 });
GroupConfigSchema.index({ extractionMethod: 1, isActive: 1 });

// Static methods for Config model
ConfigSchema.statics.getValue = async function(key: string, defaultValue?: any) {
  const config = await this.findOne({ configKey: key, isActive: true });
  return config ? config.configValue : defaultValue;
};

ConfigSchema.statics.setValue = function(key: string, value: any, description?: string) {
  return this.findOneAndUpdate(
    { configKey: key },
    { 
      configValue: value,
      description,
      isActive: true
    },
    { 
      upsert: true, 
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

ConfigSchema.statics.getActiveConfigs = function() {
  return this.find({ isActive: true }).sort({ configKey: 1 });
};

// Static methods for GroupConfig model
GroupConfigSchema.statics.getActiveGroups = function() {
  return this.find({ isActive: true }).sort({ lastScanTimestamp: 1 });
};

GroupConfigSchema.statics.updateSelectors = function(
  groupId: string, 
  newSelectors: Record<string, string>,
  version?: string
) {
  const selectorVersion = version || new Date().toISOString();
  
  return this.findOneAndUpdate(
    { groupId },
    {
      $set: {
        'selectors.version': selectorVersion,
        'selectors.selectors': newSelectors,
        'selectors.lastUpdated': new Date(),
        'selectors.isActive': true
      }
    },
    { new: true }
  );
};

GroupConfigSchema.statics.updateLastScan = function(groupId: string, timestamp: Date = new Date()) {
  return this.findOneAndUpdate(
    { groupId },
    { lastScanTimestamp: timestamp },
    { new: true }
  );
};

GroupConfigSchema.statics.getGroupsForScan = function(maxAge: number = 3600000) { // 1 hour default
  const cutoff = new Date(Date.now() - maxAge);
  
  return this.find({
    isActive: true,
    lastScanTimestamp: { $lte: cutoff }
  }).sort({ lastScanTimestamp: 1 });
};

// Instance method to update selector version
GroupConfigSchema.methods.updateSelectorVersion = function(
  newSelectors: Record<string, string>,
  version?: string
) {
  this.selectors.version = version || new Date().toISOString();
  this.selectors.selectors = newSelectors;
  this.selectors.lastUpdated = new Date();
  this.selectors.isActive = true;
  
  return this.save();
};

// Instance method to mark group as scanned
GroupConfigSchema.methods.markScanned = function(timestamp: Date = new Date()) {
  this.lastScanTimestamp = timestamp;
  return this.save();
};

export const ConfigModel = model<IConfig>('Config', ConfigSchema);
export const GroupConfigModel = model<IGroupConfig>('GroupConfig', GroupConfigSchema);