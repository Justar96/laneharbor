export default {
  // Server-side render by default
  ssr: true,
  // Build outputs
  buildDirectory: "build",
  // Server module format
  serverModuleFormat: "esm",
  // Bundle all dependencies for server
  serverDependenciesToBundle: [/.*/],
  // Future flags for compatibility
  future: {
    v3_fetcherPersist: true,
    v3_relativeSplatPath: true,
    v3_throwAbortReason: true,
  },
};
