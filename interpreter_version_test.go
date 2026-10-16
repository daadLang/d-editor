package main

import "testing"

func TestParseVersion(t *testing.T) {
	cases := map[string]string{
		"v0.2.0":                  "v0.2.0",
		"0.2.0":                   "v0.2.0",
		"daad version 0.2.0\n":    "v0.2.0",
		"daad v1.10.3-beta.1 abc": "v1.10.3-beta.1",
		"daad_0.2.0_linux_amd64":  "v0.2.0",
		"Usage: daad [file]":      "",
		"":                        "",
	}
	for input, want := range cases {
		if got := parseVersion(input); got != want {
			t.Errorf("parseVersion(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestVersionFromPath(t *testing.T) {
	cases := map[string]string{
		"/home/u/.daad-ide/interpreters/v0.2.0/daad_0.2.0_linux_amd64/daad": "v0.2.0",
		"/home/u/.daad-ide/interpreters/v0.2.0/daad_0.1.0_linux_amd64/daad": "v0.2.0",
		"/home/u/.daad-ide/interpreters/v0.1.0/daad":                        "v0.1.0",
		"/usr/bin/daad": "",
	}
	for input, want := range cases {
		if got := versionFromPath(input); got != want {
			t.Errorf("versionFromPath(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestInterpreterLabel(t *testing.T) {
	if got := interpreterLabel("v0.2.0"); got != "daad v0.2.0" {
		t.Errorf("got %q", got)
	}
	if got := interpreterLabel(""); got != "daad" {
		t.Errorf("got %q", got)
	}
}
