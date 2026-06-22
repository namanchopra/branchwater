"use client";

import { useRef, useState } from "react";

interface CopyButtonProps {
  /** Exact text written to the clipboard. */
  value: string;
  label?: string;
}

/** Copies `value` and briefly swaps its label to "Copied". */
export function CopyButton({ value, label = "Copy command" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard unavailable (insecure context) — fail silently */
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      className="copy"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : label}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
