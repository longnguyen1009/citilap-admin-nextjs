const fs = require('fs');
const path = require('path');
const dir = 'C:/Users/Admin/Desktop/citilap-admin-nextjs/components/pages';
fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.jsx') || file.endsWith('.js')) {
    const p = path.join(dir, file);
    let content = fs.readFileSync(p, 'utf8');
    if (!content.startsWith('"use client"')) {
      fs.writeFileSync(p, '"use client";\n' + content);
    }
  }
});
