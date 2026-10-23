import { toEnDigits } from "./digits";

const IRAN_MOBILE = /^09\d{9}$/;

/**
 * Normalises an Iranian mobile number to the canonical `09xxxxxxxxx` form.
 * Accepts Persian digits, spaces/dashes and the +98 / 0098 / 98 prefixes.
 * Returns null when the input is not a valid mobile number.
 */
export function normalizePhone(input: string): string | null {
  let s = toEnDigits(input).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return IRAN_MOBILE.test(s) ? s : null;
}

/** 09121234567 -> 0912***4567 (for logs). */
export function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 4)}***${phone.slice(7)}` : "***";
}
