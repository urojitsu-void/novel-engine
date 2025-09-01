import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    define: {
      __STORY__: JSON.stringify(env.VITE_STORY ?? ""),
    },
  };
});