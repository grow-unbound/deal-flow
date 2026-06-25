export interface LandingFilterOption {
  value: string;
  label: string;
}

export interface LandingFilterGroupMeta {
  key: string;
  label: string;
  options: LandingFilterOption[];
}

export interface LandingFilterMeta {
  groups: LandingFilterGroupMeta[];
}

export function appendArrayParam(params: URLSearchParams, key: string, values: string[] | undefined) {
  if (!values || values.length === 0) return;
  values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .forEach((value) => params.append(key, value));
}

export function readArrayParam(params: URLSearchParams, key: string): string[] {
  return Array.from(
    new Set(
      params
        .getAll(key)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

export function includesAny(value: string | null | undefined, selected: string[]) {
  if (selected.length === 0 || !value) return selected.length === 0;
  return selected.includes(value);
}

export function matchesAny(value: string | null | undefined, selected: string[]) {
  if (selected.length === 0) return true;
  if (!value) return false;
  return selected.includes(value);
}
