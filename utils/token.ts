import fs from 'fs';

const userData = JSON.parse(fs.readFileSync('.auth/user.json', 'utf-8'));
export const accessToken = userData?.origins?.[0]?.localStorage?.find(
  (item: any) => item.name === 'jwtToken'
)?.value;

if (!accessToken) {
  throw new Error('accessToken not found in .auth/user.json');
}