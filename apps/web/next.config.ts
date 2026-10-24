import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  // A static site: every page is HTML at build time, and the challenge is generated in the browser.
  output: "export",
  images: { unoptimized: true },
  // The data set lives at the root of the monorepo, outside the app.
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};

export default config;
