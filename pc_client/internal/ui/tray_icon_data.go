package ui

import _ "embed"

//go:embed note_all.ico
var iconData []byte

func getTrayIcon() []byte {
	return iconData
}
