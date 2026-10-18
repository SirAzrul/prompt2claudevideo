// Salin fail ini sebagai web/config.js untuk pembangunan tempatan.
// Di Netlify, config.js dijana automatik daripada environment variable
// (lihat scripts/gen-config.mjs). Anon key memang awam; keselamatan data
// bergantung pada RLS, bukan kerahsiaan key ini.
export const SUPABASE_URL = 'https://PROJEK-ANDA.supabase.co';
export const SUPABASE_ANON_KEY = 'ANON-KEY-ANDA';
