import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Der TypeScript-Compiler fängt bereits ungenutzte Variablen und Typfehler.
 * ESLint ist hier vor allem wegen der React-Hook-Regeln da: eine vergessene
 * Abhängigkeit in useEffect oder useMemo ist ein Fehler, den kein Typ verrät.
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "*.config.js"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Hooks-Regeln sind Fehler, nicht Hinweise: eine vergessene Abhängigkeit ist ein
      // Bug, den sonst niemand meldet.
      "react-hooks/exhaustive-deps": "error",
      // Ungenutzte Variablen meldet bereits tsc mit noUnusedLocals -- doppelt wäre nur Lärm.
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // shadcn/ui-Bausteine exportieren neben der Komponente ihre Varianten und
    // Primitive-Aliase. Das ist die Konvention dieser Bibliothek; die Regel meldet
    // hier nur, dass Hot Reload gröber wird -- kein Fehler, aber auch nichts, was
    // sich sinnvoll beheben liesse.
    files: ["src/components/ui/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Dieselbe Lage: Helfer, die eng zur Komponente gehören und sonst eine eigene
    // Datei bräuchten, ohne dass es die Lesbarkeit verbessert.
    files: [
      "src/components/HouseholdProvider.tsx",
      "src/components/GroupBadge.tsx",
      "src/components/transactions/SplitEditor.tsx",
    ],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
