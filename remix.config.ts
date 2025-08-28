import path from "path";

export default {
  // Server-side render by default, disable SPA mode
  ssr: true,
  // Build outputs
  buildDirectory: "build",
  // Path aliases
  serverModuleFormat: "esm",
  serverDependenciesToBundle: [/.*/],
  // Add path alias
  alias: {
    "~": path.resolve(__dirname, "./app"),
  },
};
