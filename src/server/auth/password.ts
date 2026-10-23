import bcrypt from "bcryptjs";

const COST = 12;

// Compared against when the account does not exist, so that response time does
// not reveal which usernames exist. Generated once, lazily.
let dummyHash: Promise<string> | null = null;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    dummyHash ??= bcrypt.hash("dummy-password-for-timing", COST);
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}
