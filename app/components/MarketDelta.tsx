import type { ReactNode } from "react";

export type MarketDirection = "up" | "down" | "flat";

export function marketDirection(value: string): MarketDirection {
  const trimmed = value.trimStart();
  if (/^[+▲↑]/.test(trimmed)) return "up";
  if (/^[-−▼↓]/.test(trimmed)) return "down";
  return "flat";
}

export function MarketDelta({
  value,
  className,
}: {
  value: string;
  className?: string;
}): ReactNode {
  const direction = marketDirection(value);
  const directionClass = direction === "up" ? "positive" : direction === "down" ? "negative" : "";
  const classes = ["market-delta", directionClass, className].filter(Boolean).join(" ");
  const glyph = direction === "up" ? "▲" : direction === "down" ? "▼" : null;

  return (
    <span className={classes}>
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      {value}
    </span>
  );
}
