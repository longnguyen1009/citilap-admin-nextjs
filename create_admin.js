const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce((values, line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return values;

    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
    return values;
  }, {});
}

const fileEnv = {
  ...parseEnvFile(path.join(__dirname, '.env')),
  ...parseEnvFile(path.join(__dirname, '.env.local')),
};

Object.entries(fileEnv).forEach(([key, value]) => {
  if (process.env[key] === undefined) process.env[key] = value;
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env or set them in the terminal.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Missing ADMIN_EMAIL or ADMIN_PASSWORD. Set both in the terminal or add them to .env.local.');
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

main().catch(error => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});
