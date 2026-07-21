import { Router } from 'express';
import config from '../config.js';
import { pool } from '../db.js';

const router = Router();

router.get('/config', (req, res) => {
  res.json({
    liffId: config.liffId,
    privacyPolicyUrl: config.privacyPolicyUrl,
    googleMapsApiKey: config.googleMapsApiKey,
    devBypassLineAuth: config.devBypassLineAuth,
    uploadLimits: {
      maxFiles: config.maxUploadFiles,
      maxFileMb: config.maxUploadMb,
    },
  });
});

router.get('/categories', async (req, res) => {
  const result = await pool.query(
    `SELECT id, code, name_th
       FROM complaint_categories
      WHERE is_active = true
      ORDER BY sort_order, name_th`,
  );

  res.json({ success: true, data: result.rows });
});

export default router;
