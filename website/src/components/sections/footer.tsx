import { GITHUB_URL, NPM_URL } from "@/lib/constants";

export function Footer() {
  return (
    <footer>
      <div className="wrap foot-in">
        <a className="brand" href="#top" style={{ fontSize: 15 }}>
          <span className="mark" style={{ width: 24, height: 24 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <circle cx="6" cy="6" r="2.4" />
              <circle cx="6" cy="18" r="2.4" />
              <circle cx="18" cy="8" r="2.4" />
              <path d="M6 8.4v7.2" />
              <path d="M18 10.4c0 4-4 4-6 5.2" />
            </svg>
          </span>
          Branchwater
        </a>
        <span className="grow" />
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <a href={NPM_URL} target="_blank" rel="noopener noreferrer">
          npm
        </a>
        <span>MIT © 2026</span>
      </div>
    </footer>
  );
}
