export interface CatalogFace {
  readonly family: string;
  readonly weight: number;
  /** Package that ships the file in its `files/` folder. */
  readonly package: string;
  readonly file: string;
  /** Hex code point ranges like "0-ff,131,2000-206f", as in CSS unicode-range. */
  readonly ranges: string;
}
