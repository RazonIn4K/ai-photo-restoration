import { z } from 'zod';

/**
 * Schema for photo ingestion request
 */
export const IngestPhotoSchema = z.object({
  body: z.object({
    facebookPostId: z.string().min(1, 'Facebook post ID is required'),
    facebookGroupId: z.string().min(1, 'Facebook group ID is required'),
    posterName: z.string().min(1, 'Poster name is required'),
    postUrl: z.string().url('Must be a valid URL'),
    userRequest: z.string().min(1, 'User request text is required'),
    originalImageUrl: z.string().url('Must be a valid URL'),
    imageData: z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,/, 'Must be a valid base64 image data URL')
  })
});

export type IngestPhotoRequest = z.infer<typeof IngestPhotoSchema>['body'];

/**
 * Schema for getting a single request
 */
export const GetRequestSchema = z.object({
  params: z.object({
    requestId: z.string().min(1, 'Request ID is required')
  })
});

export type GetRequestParams = z.infer<typeof GetRequestSchema>['params'];

/**
 * Schema for listing requests with filters
 */
export const ListRequestsSchema = z.object({
  query: z.object({
    status: z.enum(['queued', 'processing', 'ready_for_review', 'approved', 'posted', 'completed', 'rejected']).optional(),
    facebookGroupId: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
    sortBy: z.enum(['createdAt', 'queuedAt', 'status']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  })
});

export type ListRequestsQuery = z.infer<typeof ListRequestsSchema>['query'];
