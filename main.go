package main

import (
	"embed"
	"io/fs"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// The production frontend (`yarn build:frontend`) is written to dist/renderer.
//
//go:embed all:dist/renderer
var embeddedAssets embed.FS

func main() {
	assets, err := fs.Sub(embeddedAssets, "dist/renderer")
	if err != nil {
		log.Fatal(err)
	}

	app := application.New(application.Options{
		Name:        "ض IDE",
		Description: "Minimal IDE for the Daad Arabic programming language",
		// Every exported method of App becomes callable from the frontend
		// (see frontend/src/lib/wails.ts).
		Services: []application.Service{
			application.NewService(NewApp()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "ض IDE",
		Width:     1400,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
		// Matches the splash colour of the default dark theme, so there is no
		// white flash while the webview loads.
		BackgroundColour: application.NewRGB(14, 21, 17),
		URL:              "/",
		// Files dragged from the OS are not handled by the IDE. Leaving this off
		// also keeps the webview's own drag and drop (tabs, explorer files) intact.
		EnableFileDrop: false,
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
