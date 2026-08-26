import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "./seo";

export const metadata: Metadata = {
  title: { absolute: `找不到頁面 Page not found｜${SITE_NAME}` },
  description: "The requested page does not exist on AI Market Atlas.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AI Market Atlas">
          <span className="brand-mark" aria-hidden="true" />
          <strong>AI / ATLAS</strong>
          <span>市場情報</span>
        </Link>
      </header>

      <main className="main">
        <section className="masthead">
          <div className="masthead-copy">
            <p className="eyebrow">404</p>
            <h1>找不到這個頁面</h1>
            <p>
              這個網址不存在或已經移除。請從首頁或月度封存重新瀏覽最新的 AI 市場情報。
            </p>
            <h2>Page not found</h2>
            <p>
              This address does not exist or has been removed. Start again from the
              homepage or browse the monthly archive.
            </p>
            <p>
              <Link className="footer-archive" href="/">回到首頁 ↗</Link>
              {" "}
              <Link className="footer-archive" href="/en/">English home ↗</Link>
              {" "}
              <Link className="footer-archive" href="/archive/">月度封存 Archive ↗</Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
