import { Router } from 'express';

import { getImageHandler } from '../handlers/images.js';

export const imagesRouter = Router();

imagesRouter.get('/:type/:hash', getImageHandler);
