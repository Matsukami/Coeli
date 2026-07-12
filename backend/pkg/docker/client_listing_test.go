package docker

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"
)

func listingFrame(streamID byte, payload string) []byte {
	h := make([]byte, 8)
	h[0] = streamID
	binary.BigEndian.PutUint32(h[4:8], uint32(len(payload)))
	return append(h, []byte(payload)...)
}

func TestParseFindEntries(t *testing.T) {
	entries, truncated := parseFindEntries([]byte("a\x00b\x00\x00c\x00"))
	if truncated {
		t.Error("small input must not truncate")
	}
	if len(entries) != 3 || entries[0] != "a" || entries[1] != "b" || entries[2] != "c" {
		t.Fatalf("split/skip-empty wrong: %q", entries)
	}

	// exactly at the cap → not truncated
	e, tr := parseFindEntries([]byte(strings.Repeat("x\x00", maxListEntries)))
	if tr || len(e) != maxListEntries {
		t.Fatalf("at cap: truncated=%v len=%d (want false, %d)", tr, len(e), maxListEntries)
	}

	// cap+1 → truncated, capped to maxListEntries
	e, tr = parseFindEntries([]byte(strings.Repeat("x\x00", maxListEntries+1)))
	if !tr || len(e) != maxListEntries {
		t.Fatalf("over cap: truncated=%v len=%d (want true, %d)", tr, len(e), maxListEntries)
	}
}

func TestDemuxExecStdout_StdoutOnly_AndByteCap(t *testing.T) {
	// stdout is returned; stderr (id 2) is discarded
	in := append(listingFrame(1, "hello"), listingFrame(2, "diagnostic")...)
	out, err := demuxExecStdout(bytes.NewReader(in), 1<<20)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if string(out) != "hello" {
		t.Fatalf("want stdout only, got %q", out)
	}

	// stdout exceeding the cap → error before materializing the full buffer
	_, err = demuxExecStdout(bytes.NewReader(listingFrame(1, strings.Repeat("x", 50))), 10)
	if err == nil || !strings.Contains(err.Error(), "listing output exceeded") {
		t.Fatalf("want cap error, got %v", err)
	}
}

func TestDemuxExecStdout_TruncatedAndSystemerr(t *testing.T) {
	// a header cut short mid-frame must error, not silently drop the tail
	torn := append(listingFrame(1, "a.txt\x00"), 0x01, 0x00, 0x00) // 3 stray header bytes
	if _, err := demuxExecStdout(bytes.NewReader(torn), 1<<20); err == nil || !strings.Contains(err.Error(), "truncated") {
		t.Fatalf("want truncated-stream error, got %v", err)
	}

	// a systemerr (stream id 3) daemon error must surface, not be discarded
	sys := append(listingFrame(1, "ok"), listingFrame(3, "daemon connection reset")...)
	if _, err := demuxExecStdout(bytes.NewReader(sys), 1<<20); err == nil || !strings.Contains(err.Error(), "systemerr") {
		t.Fatalf("want systemerr, got %v", err)
	}
}
