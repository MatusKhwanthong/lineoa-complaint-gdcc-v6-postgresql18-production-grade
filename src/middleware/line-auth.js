import config from '../config.js';
import { ApiError } from '../errors.js';
import { verifyLineIdToken } from '../services/line.js';

export async function requireLineUser(req, res, next) {
  try {
    if (config.devBypassLineAuth) {
      const devUserId = req.get('x-dev-user-id');
      if (devUserId) {
        req.lineUser = {
          userId: devUserId,
          displayName: req.get('x-dev-display-name') || 'ผู้ใช้ทดสอบ',
          pictureUrl: null,
        };
        return next();
      }
    }

    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      throw new ApiError(401, 'กรุณาเข้าสู่ระบบผ่าน LINE ก่อนใช้งาน');
    }

    const profile = await verifyLineIdToken(match[1]);

    req.lineUser = {
      userId: profile.sub,
      displayName: profile.name || null,
      pictureUrl: profile.picture || null,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}
