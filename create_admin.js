const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bkgbaxcjfiqznaxctirz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZ2JheGNqZmlxem5heGN0aXJ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjcxNzc3MSwiZXhwIjoyMTAyMjkzNzcxfQ.u7uO2M0Odt5jqxFLoBXaDv0rU9iErYdibbUaN3WI8dU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const email = 'citilapvn@gmail.com';
  const password = 'citilap@123';

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
        const user = usersData.users.find(u => u.email === email);
        if (user) {
            await makeAdmin(user.id);
        }
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
  const { data: profileData, error: profileError } = await supabase.from('user_profiles').upsert([
    {
      id: userId,
      name: 'Admin',
      role: 'ADMIN',
      is_active: true
    }
  ]);

  if (profileError) {
    console.error('Error creating user profile:', profileError.message);
    process.exit(1);
  }

  console.log('✅ Admin user created successfully!');
}

main();
