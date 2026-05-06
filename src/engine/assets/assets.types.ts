export const AssetType = {
  Image: 0,
  JSON: 1,
  Font: 2,
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export interface AssetEntry {
  type: AssetType;
  key: string;
  url: string;
  fontFamily?: string;
}

export interface AssetState {
  _images: Map<string, HTMLImageElement>;
  _json: Map<string, unknown>;
  _fonts: Map<string, FontFace>;
  _pending: AssetEntry[];
  _loading: boolean;
  _progress: number;
  _total: number;
  _loaded: number;
  _errors: string[];
}
