export function normalizeIndianPhone(input: string): string {
  const digits = input.replace(/\D/g, '');

  if (digits.startsWith('91') && digits.length > 10) {
    return digits.slice(-10);
  }

  if (digits.startsWith('0') && digits.length > 10) {
    return digits.slice(-10);
  }

  return digits;
}

export function formatWhatsappDestination(phone: string): string {
  return `91${normalizeIndianPhone(phone)}`;
}

export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9][0-9]{9}$/.test(normalizeIndianPhone(phone));
}

export function firstNameFromValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const [first] = trimmed.split(/\s+/);
  return first || null;
}
