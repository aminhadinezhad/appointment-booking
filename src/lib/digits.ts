const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Converts Persian and Arabic-Indic digits to ASCII digits. */
export function toEnDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const fa = FA_DIGITS.indexOf(ch);
    return String(fa >= 0 ? fa : AR_DIGITS.indexOf(ch));
  });
}

/** Converts ASCII digits to Persian digits for display. */
export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]!);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
