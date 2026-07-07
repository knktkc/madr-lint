import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineCommand } from 'citty';
import { CONFIG_FILES, resolveExtends } from '../core/config.js';
import { findAdrFiles } from '../core/discover.js';
import {
  CONFIG_FILENAME_BY_FORMAT,
  GETTING_STARTED_URL,
  buildEpilogue,
  detectAdrDir,
  detectConfigFormat,
  detectMadrVersion,
  findExistingConfigFile,
  renderConfig,
  type AdrDirSource,
} from '../core/init.js';
import { lintFiles } from '../core/lint.js';
import type { AnyRule } from '../core/types.js';
import * as builtinRules from '../rules/index.js';

/**
 * `madr-lint init` — scaffold a config file (issue #30).
 *
 * Non-interactive by design: every decision is a filesystem heuristic or a
 * flag, so it works in CI and behind pipes. Detects the ADR directory, the
 * dominant MADR version, and whether to write TS or JSON; refuses to clobber
 * an existing config unless `--force`.
 */
export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description:
      'Scaffold a madr-lint config file (detects ADR directory, MADR version, and TS vs JSON)',
  },
  args: {
    force: {
      type: 'boolean',
      description: 'Overwrite an existing config file',
      default: false,
    },
    dir: {
      type: 'string',
      description: 'ADR directory to write into the config, overriding detection',
      required: false,
    },
    json: {
      type: 'boolean',
      description: 'Emit a machine-readable JSON summary instead of text',
      default: false,
    },
  },
  run({ args }) {
    const cwd = process.cwd();

    // Usage errors first. An empty --dir is falsy, so without this guard it
    // would silently fall through to auto-detection (e.g. --dir "$UNSET_VAR")
    // — the same footgun class --max-warnings "" guards against in cli.ts.
    const rawDir = args.dir as string | undefined;
    if (rawDir !== undefined && rawDir.trim() === '') {
      console.error(`Invalid --dir "${rawDir}": must be a non-empty path.`);
      process.exit(2);
    }

    const existing = findExistingConfigFile(cwd);
    if (existing && args.force !== true) {
      console.error(
        `A madr-lint config already exists: ${existing}. Re-run with --force to overwrite.`,
      );
      process.exit(2);
    }

    // ── Detection ────────────────────────────────────────────────────
    let adrDir: string;
    let adrDirSource: AdrDirSource;
    if (rawDir !== undefined) {
      adrDir = rawDir;
      adrDirSource = 'override';
    } else {
      const detected = detectAdrDir(cwd);
      adrDir = detected.adrDir;
      adrDirSource = detected.source;
    }
    const madrVersion = detectMadrVersion(cwd, adrDir);
    const configFormat = detectConfigFormat(cwd);
    const configPath = CONFIG_FILENAME_BY_FORMAT[configFormat];

    // ── Write ────────────────────────────────────────────────────────
    writeFileSync(
      resolve(cwd, configPath),
      renderConfig(configFormat, { adrDir, madrVersion }),
    );
    // --force replaces the canonical file for the DETECTED format. A
    // pre-existing config under a different name would still win (or lose)
    // discovery order silently — never leave that unsaid, and state the
    // ACTUAL direction: CONFIG_FILES index order decides which file wins.
    if (existing && existing !== configPath) {
      const oldWins =
        CONFIG_FILES.indexOf(existing) < CONFIG_FILES.indexOf(configPath);
      console.error(
        oldWins
          ? `Note: ${existing} still exists and precedes ${configPath} in config discovery — remove it to make the new config take effect.`
          : `Note: the leftover ${existing} is now shadowed by ${configPath}, which precedes it in config discovery — you can delete it.`,
      );
    }

    // ── Initial in-process lint (cheap) ──────────────────────────────
    // Counts violations of the freshly scaffolded config so the epilogue can
    // suggest --update-baseline on legacy repos. Never fails init: a lint
    // crash is reported but the scaffold already succeeded.
    const files = findAdrFiles(resolve(cwd, adrDir));
    let errors = 0;
    let warnings = 0;
    if (files.length > 0) {
      try {
        const config = resolveExtends({ extends: ['madr-lint:recommended'] });
        const allRules: AnyRule[] = Object.values(builtinRules);
        const result = lintFiles({
          rules: allRules,
          ruleSeverity: config.rules,
          files,
          cwd,
          cache: null,
          baseline: null,
        });
        for (const d of result.diagnostics) {
          if (d.severity === 'error') errors++;
          else warnings++;
        }
      } catch (err) {
        console.error(
          `Note: the initial lint failed (${err instanceof Error ? err.message : String(err)}); the config was still written.`,
        );
      }
    }

    // ── Report ───────────────────────────────────────────────────────
    const filesChecked = files.length;
    const suggestUpdateBaseline = filesChecked > 0 && errors + warnings > 0;
    if (args.json === true) {
      console.log(
        JSON.stringify(
          {
            written: true,
            configPath,
            configFormat,
            adrDir,
            adrDirSource,
            madrVersion,
            filesChecked,
            errors,
            warnings,
            suggestUpdateBaseline,
            docsUrl: GETTING_STARTED_URL,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        buildEpilogue({
          adrDir,
          adrDirSource,
          configPath,
          filesChecked,
          errors,
          warnings,
        }),
      );
    }
    process.exit(0);
  },
});
