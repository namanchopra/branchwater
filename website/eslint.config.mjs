import tseslint from "typescript-eslint";

/**
 * Flat ESLint config for the marketing site. Uses typescript-eslint's
 * recommended rules (TypeScript-aware, so no spurious `no-undef` on browser
 * globals). Type correctness itself is enforced by `next build` + `tsc`.
 */
export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "next.config.ts"] },
  ...tseslint.configs.recommended,
);
