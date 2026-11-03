export interface BundledFont {
  readonly family: string;
  readonly weight: number;
  readonly subset: string;
  /** File name inside the font package's `files/` folder. */
  readonly file: string;
}

export const FONT_PACKAGE = '@fontsource/inter';

const SUBSETS = ['latin', 'latin-ext', 'greek'] as const;
const WEIGHTS = [400, 500] as const;

/** Label fonts bundled with every diagram. Earlier subsets win when several cover a character. */
export const BUNDLED_FONTS: readonly BundledFont[] = WEIGHTS.flatMap((weight) =>
  SUBSETS.map((subset) => ({
    family: 'Inter',
    weight,
    subset,
    file: `inter-${subset}-${weight}-normal.woff`,
  })),
);

/** CSS font-family values for live (non-outlined) SVG text. */
export const CSS_FONT_STACKS: Readonly<Record<string, string>> = {
  Inter: "Inter, 'Helvetica Neue', Arial, sans-serif",
};
