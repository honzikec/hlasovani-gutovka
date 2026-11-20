import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'gutovka_admin_session';
const TOKEN_PURPOSE = 'gutovka-admin-v1';

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() ?? '';
}

export function isAdminAuthRequired(): boolean {
  return getAdminPassword().length > 0;
}

function deriveExpectedToken(password: string): string {
  return crypto
    .createHmac('sha256', password)
    .update(TOKEN_PURPOSE)
    .digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyAdminPassword(candidate: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return true;
  if (!candidate) return false;
  return safeEqual(candidate, expected);
}

export function createAdminSessionToken(): string {
  const password = getAdminPassword();
  return deriveExpectedToken(password);
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  const password = getAdminPassword();
  if (!password) return true;
  if (!token) return false;
  return safeEqual(token, deriveExpectedToken(password));
}

export async function isAdminAuthenticated(request?: NextRequest): Promise<boolean> {
  if (!isAdminAuthRequired()) return true;

  if (request) {
    const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    return verifyAdminSessionToken(token);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}
