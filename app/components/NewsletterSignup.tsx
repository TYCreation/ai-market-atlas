"use client";

export function NewsletterSignup({ endpoint }: { endpoint?: string }) {
  const enabled = Boolean(endpoint);
  return (
    <section className="newsletter" aria-labelledby="newsletter-title">
      <div>
        <p className="section-kicker">讀者更新 / Reader updates</p>
        <h2 id="newsletter-title">訂閱週報 / Subscribe to the weekly brief</h2>
        <p>
          每週三、週六收到新的 AI 市場情報。只在設定安全的 HTTPS 訂閱服務後開放。
          <br />
          Receive the Wednesday and Saturday brief. Signup opens only when a secure HTTPS service is configured.
        </p>
      </div>
      <form
        className="newsletter-form"
        action={enabled ? endpoint : undefined}
        method={enabled ? "post" : undefined}
      >
        <label htmlFor="newsletter-email">電子郵件 / Email</label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          disabled={!enabled}
          aria-describedby="newsletter-consent newsletter-status"
        />
        <label id="newsletter-consent" className="newsletter-consent">
          <input
            type="checkbox"
            name="newsletter-consent"
            value="yes"
            required
            disabled={!enabled}
          />
          <span>我同意接收週報，並了解可隨時取消。 / I agree to receive the brief and can unsubscribe anytime.</span>
        </label>
        <button type="submit" disabled={!enabled} aria-disabled={enabled ? undefined : true}>
          訂閱 / Subscribe
        </button>
        <p id="newsletter-status" className="newsletter-status" role="status">
          {enabled
            ? "隱私：僅提交至已設定的 HTTPS 訂閱服務。 / Privacy: submitted only to the configured HTTPS service."
            : "目前尚未開放訂閱。未設定服務，因此不會收集、儲存、記錄或提交電子郵件。 / Newsletter signup is not configured; no email is collected, stored, logged, or submitted."}
        </p>
      </form>
    </section>
  );
}
