---
"madr-lint": patch
---

Stop following symbolic links committed to a repository. The directory walk skips linked directories, and a start path or explicit argument that a link takes outside the working directory now exits with code 2. Cache, baseline, and `init` writes replace a link instead of writing to its target, and they refuse linked parent directories. A config `cacheLocation` outside the working directory is ignored with a warning. The GitHub Action now passes `--no-cache`. `cache: false` in a config now takes effect, invalid frontmatter is reported per file without printing the file's content, and the `github` format escapes a cached line number.
