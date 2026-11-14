export type MediaKind = "image" | "video";

export interface MediaItem {
  index: number;
  kind: MediaKind;
  token: string;
  thumbnail_token: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  filename: string;
}

export type ResultStatus = "available" | "partial" | "unavailable";

export interface ResolveResult {
  status: ResultStatus;
  post_type: string;
  source_url: string;
  embed_url: string;
  shortcode: string;
  caption: string | null;
  author: string | null;
  duration: number | null;
  media_items: MediaItem[];
  zip_token: string | null;
  limitations: string[];
  provider: string | null;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0) {
    super(message);
  }
}
