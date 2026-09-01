/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const DISCOVERY_HEADERS: Record<string, string> = {
  "/rss.xml": "application/rss+xml; charset=utf-8",
  "/news-sitemap.xml": "application/xml; charset=utf-8",
  "/llms.txt": "text/plain; charset=utf-8",
};

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const discoveryType = DISCOVERY_HEADERS[url.pathname];
    if (discoveryType) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 200) return response;
      const headers = new Headers(response.headers);
      headers.set("content-type", discoveryType);
      headers.set("cache-control", "public, max-age=300, s-maxage=3600");
      return new Response(response.body, { status: response.status, headers });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
