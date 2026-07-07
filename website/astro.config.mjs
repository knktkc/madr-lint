// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

const BASE = '/madr-lint';

// Prepend the site base to root-relative links written in Markdown content
// (e.g. `/guides/configuration/`, `/ja/rules/status-enum/`). Astro does not
// base-prefix arbitrary Markdown links, so without this they 404 on the
// project subpath. Japanese pages link with an explicit `/ja/...` prefix in
// their source, so a single base prepend keeps readers in the right locale.
// External URLs, protocol-relative `//` links, and already-based links are
// left alone.
function rehypeBaseLinks() {
  /** @param {any} node */
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'a') {
      const href = node.properties?.href;
      if (
        typeof href === 'string' &&
        href.startsWith('/') &&
        !href.startsWith('//') &&
        href !== BASE &&
        !href.startsWith(`${BASE}/`)
      ) {
        node.properties.href = BASE + href;
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  /** @param {any} tree */
  return (tree) => walk(tree);
}

// Project site published to GitHub Pages at https://knktkc.github.io/madr-lint/
export default defineConfig({
  site: 'https://knktkc.github.io',
  base: BASE,
  markdown: {
    rehypePlugins: [rehypeBaseLinks],
  },
  integrations: [
    starlight({
      title: 'madr-lint',
      description:
        'A fast, configurable linter for MADR (Markdown Architectural Decision Records).',
      tagline: 'A fast, configurable linter for MADR.',
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: true,
      },
      customCss: ['./src/styles/custom.css'],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/knktkc/madr-lint' },
      ],
      // English is served at the root (no /en/ prefix); Japanese under /ja/.
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ja: { label: '日本語', lang: 'ja' },
      },
      plugins: [
        // Serves /llms.txt (index) + /llms-full.txt (full concatenated docs) at
        // build time — see https://github.com/knktkc/madr-lint/issues/68. The
        // plugin filters content-collection docs by Starlight's `defaultLocale`
        // (`root` = English here), so llms-full.txt is EN-only: the /ja/ tree is
        // a translation of the same content, and duplicating it would bloat the
        // file without adding information for an LLM. Pinned to 0.11.x, which
        // requires Astro ^7.0.0 / Starlight >=0.41 — bumped in lockstep with
        // astro + @astrojs/starlight in the Astro 7 upgrade (superseded
        // dependabot #81, which bumped astro alone and broke the build).
        starlightLlmsTxt({
          projectName: 'madr-lint',
          description:
            'A fast, configurable linter for MADR (Markdown Architectural Decision Records) — validates ADR file structure, naming, status enums, dates, and cross-file integrity.',
        }),
      ],
      sidebar: [
        {
          label: 'Guides',
          translations: { ja: 'ガイド' },
          items: [
            { slug: 'guides/getting-started', translations: { ja: 'はじめに' } },
            { slug: 'guides/cli', translations: { ja: 'CLI' } },
            { slug: 'guides/configuration', translations: { ja: '設定' } },
            {
              slug: 'guides/adopting-existing-repo',
              translations: { ja: '既存リポジトリへの導入' },
            },
            { slug: 'guides/suppressing-rules', translations: { ja: 'ルールの抑制' } },
            { slug: 'guides/github-action', translations: { ja: 'GitHub Action' } },
            { slug: 'guides/api', translations: { ja: 'プログラマティックAPI' } },
            { slug: 'guides/ai-agents', translations: { ja: 'AIエージェント' } },
          ],
        },
        {
          label: 'Rules',
          translations: { ja: 'ルール' },
          items: [
            { slug: 'rules', translations: { ja: 'ルール一覧' } },
            { slug: 'rules/required-sections' },
            { slug: 'rules/status-enum' },
            { slug: 'rules/date-iso8601' },
            { slug: 'rules/filename-format' },
            { slug: 'rules/no-broken-links' },
            { slug: 'rules/no-duplicate-numbering' },
            { slug: 'rules/no-numbering-gap' },
            { slug: 'rules/supersedes-bidirectional' },
          ],
        },
      ],
    }),
  ],
});
