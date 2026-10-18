// Jana web/config.js daripada environment variable semasa build di Netlify.
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL dan SUPABASE_ANON_KEY mesti ditetapkan.');
  process.exit(1);
}
if (/service_role/i.test(key) || (key.split('.')[1] && Buffer.from(key.split('.')[1], 'base64').toString().includes('"service_role"'))) {
  console.error('Ini kelihatan seperti service_role key. Jangan letak dalam frontend. Guna anon key.');
  process.exit(1);
}
writeFileSync(
  new URL('../web/config.js', import.meta.url),
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`,
);
console.log('web/config.js dijana.');
