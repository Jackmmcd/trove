const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const accounts = [
  { email: 'tim@pennantcapital.com', user_id: '6332e5ce-63b2-436a-925b-789391a69858' },
  { email: 'jackmcd2004@gmail.com',  user_id: 'a55d1565-08af-4a75-a408-de741f83bf54' },
];

(async () => {
  for (const { email, user_id } of accounts) {
    const { error } = await supabase.from('paper_accounts').upsert(
      { user_id, cash: 10000 },
      { onConflict: 'user_id' }
    );
    if (error) console.log('ERROR', email, error.message);
    else console.log('OK   ', email, '— $10,000 paper account ready');
  }
})();
