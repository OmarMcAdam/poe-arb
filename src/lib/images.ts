const POE_CDN = "https://web.poecdn.com";

export function normalizeImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith("/gen/image/")) return `${POE_CDN}${src}`;
  return src;
}
