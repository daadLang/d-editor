import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root: "src/mainview",
	publicDir: fileURLToPath(new URL("./img", import.meta.url)),
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
	},
	server: {
		port: 5173,
		strictPort: true,
		fs: {
			allow: [projectRoot],
		},
	},
});