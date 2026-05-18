require('dotenv').config();

const OWNER_NUMBERS = (process.env.OWNER_NUMBERS
  ? process.env.OWNER_NUMBERS.split(',').map((v) => v.trim()).filter(Boolean)
  : [
      '6285882846665@s.whatsapp.net',
      '6282120196167@s.whatsapp.net'
    ]);

module.exports = {
  OWNER_NUMBERS,
  RENT_WARNING_DAYS: Number.parseInt(process.env.RENT_WARNING_DAYS || '3', 10),
  TIMEZONE: process.env.TIMEZONE || 'Asia/Jakarta',
  AUTH_DIR: process.env.AUTH_DIR || 'auth_info_baileys',
  DB_PATH: process.env.DB_PATH || './db/finance.sqlite',
  LOG_LEVEL: process.env.LOG_LEVEL || 'silent',
  CLAIM_OWNER_CODE: process.env.CLAIM_OWNER_CODE || 'Ditsanalah144',
  LOVABLE_API_URL: process.env.LOVABLE_API_URL || 'https://wabot-dashboard.lovable.app',
  LOVABLE_API_KEY: process.env.LOVABLE_API_KEY || ''
};
