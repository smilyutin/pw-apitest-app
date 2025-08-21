import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config(); // optional, loads .env if present

export type Creds = {
  email: string;
  password: string;
  baseUrl?: string;
};

let cached: Creds | null = null;

export function getCreds(): Creds {
  if (cached) return cached;

  // Prefer file
  const filePath = path.join(process.cwd(), '.auth', 'creds.json');
  let fileCreds: Partial<Creds> = {};
  try {
    if (fs.existsSync(filePath)) {
      fileCreds = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    // ignore parse errors; will rely on env
  }

  // Allow environment overrides (CI-friendly)
  const email = process.env.PW_EMAIL ?? fileCreds.email;
  const password = process.env.PW_PASSWORD ?? fileCreds.password;
  const baseUrl = process.env.PW_BASE_URL ?? fileCreds.baseUrl;

  if (!email || !password) {
    throw new Error(
      'Missing credentials. Provide .auth/creds.json or set PW_EMAIL & PW_PASSWORD env vars.'
    );
  }

  cached = { email, password, baseUrl };
  return cached;
}