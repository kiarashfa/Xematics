# Third-party notices

Xematics includes and uses the third-party software and fonts listed below. Each remains under its own license; the KFA Source-Available License does not apply to them.

## Included in the website and in generated diagrams

| Component                                     | Version          | License    | Source                                         |
| --------------------------------------------- | ---------------- | ---------- | ---------------------------------------------- |
| Inter font (packaged by Fontsource)           | 5.3.0            | OFL-1.1    | <https://github.com/rsms/inter>                |
| Vazirmatn font (Persian and Arabic labels)    | 5.3.0            | OFL-1.1    | <https://github.com/rastikerdar/vazirmatn>     |
| Noto Sans Hebrew font (Hebrew labels)         | 5.3.0            | OFL-1.1    | <https://github.com/notofonts/hebrew>          |
| Noto Sans SC, JP and KR fonts (CJK labels)    | 5.3.1            | OFL-1.1    | <https://github.com/notofonts/noto-cjk>        |
| MathJax (math in labels)                      | 4.1.3            | Apache-2.0 | <https://www.mathjax.org>                      |
| MathJax New Computer Modern font data         | 4.1.3            | Apache-2.0 | <https://github.com/mathjax/MathJax-fonts>     |
| bidi-js (Unicode bidirectional algorithm)     | 1.1.0            | MIT        | <https://github.com/lojjic/bidi-js>            |
| Archivo font (site text)                      | 5.3.0            | OFL-1.1    | <https://github.com/Omnibus-Type/Archivo>      |
| IBM Plex Mono font (site code text)           | 5.3.0            | OFL-1.1    | <https://github.com/IBM/plex>                  |
| EB Garamond font (wordmark, profile initials) | 5.3.0            | OFL-1.1    | <https://github.com/octaviopardo/EBGaramond12> |
| harfbuzzjs (HarfBuzz compiled to WebAssembly) | 1.6.4            | MIT        | <https://github.com/harfbuzz/harfbuzzjs>       |
| HarfBuzz text shaping engine                  | bundled in above | "Old MIT"  | <https://github.com/harfbuzz/harfbuzz>         |
| Valibot                                       | 1.5.0            | MIT        | <https://valibot.dev>                          |
| yaml                                          | 2.9.1            | ISC        | <https://eemeli.org/yaml/>                     |
| Svelte (editor runtime)                       | 5.57.3           | MIT        | <https://svelte.dev>                           |

## Used by the command-line tool and the site build

| Component                                         | Version | License | Source                               |
| ------------------------------------------------- | ------- | ------- | ------------------------------------ |
| resvg-js (resvg compiled to WebAssembly, for PNG) | 2.6.2   | MPL-2.0 | <https://github.com/yisibl/resvg-js> |

## Used to build the website

| Component                                       | Version             | License |
| ----------------------------------------------- | ------------------- | ------- |
| Astro                                           | 7.4.2               | MIT     |
| @astrojs/svelte, @astrojs/mdx, @astrojs/sitemap | 9.1.1, 8.1.1, 3.7.4 | MIT     |
| Tailwind CSS                                    | 4.3.3               | MIT     |

## Licenses in short

All fonts are under the SIL Open Font License 1.1, MathJax and its font data under the Apache License 2.0, resvg under the Mozilla Public License 2.0, HarfBuzz under its "Old MIT" license (<https://github.com/harfbuzz/harfbuzz/blob/main/COPYING>), and the other libraries under the MIT or ISC licenses. Everything is used unmodified. Diagrams contain outlines of the label fonts, or small embedded subsets of them when text stays editable, which these licenses allow. resvg is used only by the command-line tool and to draw the site's preview image; it is not part of the website. Development tools (TypeScript, ESLint, Prettier, Vitest, Playwright, axe-core, fast-check) are used only to build and test Xematics.

The complete copyright notices and license texts are collected from each package when the site is built and published with it as third-party-notices.txt.
