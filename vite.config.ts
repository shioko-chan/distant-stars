import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: { ignored: ["**/.unreal-engine/**", "**/asset-sources/**", "**/unreal/**"] }
  },
  build: {
    outDir: "unreal/Content/Web",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"]
        }
      }
    }
  }
});
