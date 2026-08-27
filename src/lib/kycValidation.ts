/**
 * KYC validation helpers. DOB must be valid calendar date,
 * not in future, and user must be at least 18.
 * Accepts MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD.
 */
export interface DobValidationResult {
  valid: boolean;
  error?: string;
}

const DATE_REGEXES = [
  /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(19|20)\d{2}$/, // MM/DD/YYYY
  /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-(19|20)\d{2}$/, // MM-DD-YYYY
  /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/, // YYYY-MM-DD
];

export function validateDobFormat(value: string): DobValidationResult {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, error: "Date of birth is required" };
  const matches = DATE_REGEXES.some((r) => r.test(trimmed));
  if (!matches) return { valid: false, error: "Use MM/DD/YYYY, MM-DD-YYYY or YYYY-MM-DD" };
  const parsed = parseDob(trimmed);
  if (!parsed) return { valid: false, error: "Invalid date" };
  const { year, month, day } = parsed;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { valid: false, error: `Invalid calendar date: ${trimmed}` };
  }
  if (date > new Date()) return { valid: false, error: "Date cannot be in the future" };
  const age = getAge(date);
  if (age < 18) return { valid: false, error: "You must be at least 18 years old" };
  if (age > 120) return { valid: false, error: "Please check the year" };
  return { valid: true };
}

function parseDob(value: string): { year: number; month: number; day: number } | null {
  const slash = value.includes("/");
  const dash = value.includes("-");
  if (slash) {
    const [m, d, y] = value.split("/").map(Number);
    if (!m || !d || !y) return null;
    return { year: y, month: m, day: d };
  }
  if (dash) {
    const parts = value.split("-");
    if (parts[0].length === 4) {
      const [y, m, d] = parts.map(Number);
      return { year: y, month: m, day: d };
    } else {
      const [m, d, y] = parts.map(Number);
      return { year: y, month: m, day: d };
    }
  }
  return null;
}

function getAge(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function formatDobForDisplay(value: string): string {
  const parsed = parseDob(value.trim());
  if (!parsed) return value;
  const { year, month, day } = parsed;
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
}
