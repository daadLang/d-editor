import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Ḍād IDE",
		identifier: "com.daad.ide",
		version: "0.0.1",
	},
	build: {
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"dist/logo.png": "views/mainview/logo.png",
			"dist/logo-dark.png": "views/mainview/logo-dark.png",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;