/** Mirrors signup slugify — lowercase, hyphenated, max 50 chars. */
export function onboardingSlugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
