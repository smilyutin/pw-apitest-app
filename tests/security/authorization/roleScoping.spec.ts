//Role scoping: endpoints enforce least privilege (e.g., viewer vs admin).
import path from 'path';
import fs from 'fs';

const API = 'https://conduit-api.bondaracademy.com';
const json = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

const matrixPath = path.resolve(__dirname, 'rbac-matrix.json');
const matrix = json(matrixPath);

// Resolve creds files relative to repo root
const userCredsFile = path.resolve(process.cwd(), matrix.auth?.userCredsFile ?? '.secrets/creds.json');
const adminCredsFile = matrix.auth?.adminCredsFile
  ? path.resolve(process.cwd(), matrix.auth.adminCredsFile)
  : null;

if (!fs.existsSync(userCredsFile)) {
  throw new Error(`User creds file not found: ${userCredsFile}`);
}

const credsUser = json(userCredsFile);
const credsAdmin = adminCredsFile && fs.existsSync(adminCredsFile)
  ? json(adminCredsFile)
  : null; // OK if null; tests should handle missing admin