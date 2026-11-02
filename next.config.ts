import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lokalne narzędzie: wszystko dynamiczne, bez prerenderingu.
  serverExternalPackages: ["playwright", "playwright-core", "unpdf"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
