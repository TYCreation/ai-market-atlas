/** Return only a browser-safe, explicitly configured newsletter endpoint. */
export function resolveNewsletterEndpoint(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function configuredNewsletterEndpoint(): string | undefined {
  return resolveNewsletterEndpoint(
    process.env.NEWSLETTER_ENDPOINT ??
      process.env.NEWSLETTER_URL ??
      process.env.NEXT_PUBLIC_NEWSLETTER_ENDPOINT ??
      process.env.NEXT_PUBLIC_NEWSLETTER_URL,
  );
}
