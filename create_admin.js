const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD before running this script.');
    process.exit(1);
  }

  console.log(`Creating user ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log('User already exists, fetching ID...');
      const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
      if (usersError) {
        console.error('Error listing users:', usersError.message);
        process.exit(1);
      }
      const user = usersData.users.find(candidate => candidate.email === email);
      if (user) await makeAdmin(user.id);
      return;
    }
    console.error('Error creating user:', authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`User created with ID: ${userId}`);
  await makeAdmin(userId);
}

async function makeAdmin(userId) {
  console.log('Adding user to user_profiles with ADMIN role...');
  const { error: profileError } = await supabase.from('user_profiles').upsert([{
    id: userId,
    name: 'Admin',
    role: 'ADMIN',
    is_active: true
  }]);

  if (profileError) {
    console.error('Error creating user profile:', profileError.message);
    process.exit(1);
  }

  console.log('Admin user created successfully.');
}

main();
