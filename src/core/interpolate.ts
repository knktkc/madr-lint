// Shared {{placeholder}} interpolation for message AND suggestion templates.
// Lives in a leaf module so both the runner (which resolves a diagnostic's
// `suggestion` at report time) and the reporter (which renders the `message`
// from its template) use one implementation — never two that can drift.

/**
 * Substitute `{{key}}` placeholders in `template` with the matching value from
 * `data`, stringified. An unknown key is left intact (`{{key}}`) so a missing
 * interpolation is a visible bug surface rather than a silent empty string.
 */
export function interpolate(
  template: string,
  data: Record<string, unknown>,
): string {
  // Fast-path placeholder-free templates (e.g. static suggestions): skip the
  // regex scan + callback allocation entirely. This is on the report hot path
  // — resolved once per emitted diagnostic — so the substring guard matters for
  // the sub-microsecond filename-format micro-bench.
  if (!template.includes('{{')) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = data[key];
    return v !== undefined ? String(v) : `{{${key}}}`;
  });
}
