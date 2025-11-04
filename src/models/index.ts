// Export all models for easy importing
export { ActionLogModel, type IActionLog } from './ActionLog.js';
export { RequestRecordModel, type IRequestRecord } from './RequestRecord.js';
export { ConsentRecordModel, type IConsentRecord } from './ConsentRecord.js';
export { ConfigModel, GroupConfigModel, type IConfig, type IGroupConfig } from './Config.js';

// Re-export types for convenience
export type * from '../types/index.js';