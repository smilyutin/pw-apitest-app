import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config(); // optional, loads .env if present

export type Creds = {
  email: string;
  password: string;
  baseUrl?: string;
  role: string;
};

// Simple in-memory cache (per role)
const cache: Record<string, Creds> = {};

export function getCreds(role: 'user' | 'admin' = 'user'): Creds {
  if (cache[role]) return cache[role];

  // Default: look inside .secrets
  const secretsPath = path.join(process.cwd(), '.secrets', `${role}.creds.json`);
  let fileCreds: Partial<Creds> = {};

  try {
    if (fs.existsSync(secretsPath)) {
      fileCreds = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`⚠️ Could not read ${secretsPath}:`, err);
  }

  // Allow environment overrides (CI/CD friendly)
  const email = process.env[`PW_${role.toUpperCase()}_EMAIL`] ?? fileCreds.email;
  const password = process.env[`PW_${role.toUpperCase()}_PASSWORD`] ?? fileCreds.password;
  const baseUrl = process.env.PW_BASE_URL ?? fileCreds.baseUrl;

  if (!email || !password) {
    throw new Error(
      `Missing ${role} credentials. Provide .secrets/${role}.creds.json or set PW_${role.toUpperCase()}_EMAIL & PW_${role.toUpperCase()}_PASSWORD env vars.`
    );
  }

  cache[role] = { email, password, baseUrl, role };
  return cache[role];
}