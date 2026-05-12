import { writeFileSync } from 'fs';

const rows: string[] = [];

for (let i = 1; i <= 100; i++) {
    rows.push(`testuser${i}@test.com,password123`);
}

writeFileSync('./artillery/users.csv', rows.join('\n'));
console.log('artillery/users.csv generated');
