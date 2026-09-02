const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// mmcd.jack@gmail.com
const JACK_ID = '4aee7da7-c150-46d6-adc4-2a305ca7bd71';

(async () => {
  const { error: fe } = await sb.from('funds').update({ user_id: JACK_ID }).is('user_id', null);
  if (fe) console.log('funds error:', fe.message);
  else console.log('✓ All existing funds assigned to mmcd.jack@gmail.com');

  const { error: he } = await sb.from('holdings').update({ user_id: JACK_ID }).is('user_id', null);
  if (he) console.log('holdings error:', he.message);
  else console.log('✓ All existing holdings assigned to mmcd.jack@gmail.com');
})();
