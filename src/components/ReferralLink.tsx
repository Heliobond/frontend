
"use client";

import { useCallback, useState } from "react";

interface ReferralLinkProps {
  code: string;
  baseUrl?: string;
}

/**
 * ReferralLink (issue #300) — shows a shareable referral URL with
 * copy-to-clipboard and native share support.
 */
export function ReferralLink({
  code,
  baseUrl = "https://heliobond.com",
}: ReferralLinkProps) {
  const [copied, setCopied] = useState(false);
  const url = [baseUrl.replace(/\/$/, ""), "?ref=", encodeURIComponent(code)].join("");

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [url]);

  const share = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Heliobond", url });
      } catch {
        /* user cancelled */
      }
    } else {
      await copy();
    }
  }, [url, copy]);

  return (
    <div className="referral-link" data-testid="referral-link">
      <span className="referral-link__url">{url}</span>
      <button type="button" onClick={copy} aria-label="Copy referral link">
        {copied ? "Copied" : "Copy"}
      </button>
      <button type="button" onClick={share} aria-label="Share referral link">
        Share
      </button>
    </div>
  );
}

export default ReferralLink;
