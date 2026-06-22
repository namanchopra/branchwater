/** Shared, single-source content values for the Branchwater marketing site. */

export const SITE_URL = "https://branchwater.dev";
export const GITHUB_URL = "https://github.com/namanchopra/branchwater";
export const NPM_URL = "https://www.npmjs.com/package/branchwater";

/** The canonical one-line install command, reused across hero / install / CTA. */
export const INSTALL_CMD = "npm i -g branchwater";

/** Primary nav anchors. */
export const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#compare", label: "Why" },
  { href: "#install", label: "Install" },
] as const;
