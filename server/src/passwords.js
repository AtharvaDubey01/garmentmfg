// Hashed passwords, used for the hidden KANVTECH support login (login.passwordhash).
// A hash can't be turned back into the password, so even someone reading the database
// can't see it. Normal logins keep plain passwords (visible to admins on purpose).
import crypto from 'crypto';

/** "scrypt:<salt>:<hash>" for a password */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/** Does `password` match a hash made by hashPassword? */
export function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}
