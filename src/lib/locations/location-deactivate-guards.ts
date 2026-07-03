export function normalizeLocationAddress(raw: unknown): {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { line1: '', line2: '', city: '', state: '', pincode: '' };
  }
  const o = raw as Record<string, unknown>;
  const street = typeof o.street === 'string' ? o.street : '';
  const line1 = typeof o.line1 === 'string' ? o.line1 : street;
  return {
    line1,
    line2: typeof o.line2 === 'string' ? o.line2 : '',
    city: typeof o.city === 'string' ? o.city : '',
    state: typeof o.state === 'string' ? o.state : '',
    pincode: typeof o.pincode === 'string' ? o.pincode : '',
  };
}
