// Registry of all built-in madr-lint rules.
// New rules append here via the add-rule skill.

export { default as dateIso8601 } from './date-iso8601/index.js';
export { default as filenameFormat } from './filename-format/index.js';
export { default as noDuplicateNumbering } from './no-duplicate-numbering/index.js';
export { default as requiredSections } from './required-sections/index.js';
export { default as statusEnum } from './status-enum/index.js';
