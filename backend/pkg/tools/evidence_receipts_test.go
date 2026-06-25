package tools

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestEvidenceReceiptHashDeterministic(t *testing.T) {
	t.Parallel()

	argsHashA, err := hashCanonicalJSON(json.RawMessage(`{"b":2,"a":{"d":4,"c":3}}`))
	if err != nil {
		t.Fatalf("hashCanonicalJSON() unexpected error: %v", err)
	}
	argsHashB, err := hashCanonicalJSON(json.RawMessage(`{"a":{"c":3,"d":4},"b":2}`))
	if err != nil {
		t.Fatalf("hashCanonicalJSON() unexpected error: %v", err)
	}
	if argsHashA != argsHashB {
		t.Fatalf("canonical argument hashes differ: %s != %s", argsHashA, argsHashB)
	}

	receipt := testEvidenceReceipt(argsHashA, hashBytes([]byte("result")))
	hashA, err := computeEvidenceReceiptHash(receipt)
	if err != nil {
		t.Fatalf("computeEvidenceReceiptHash() unexpected error: %v", err)
	}
	hashB, err := computeEvidenceReceiptHash(receipt)
	if err != nil {
		t.Fatalf("computeEvidenceReceiptHash() unexpected error: %v", err)
	}
	if hashA != hashB {
		t.Fatalf("receipt hash should be deterministic: %s != %s", hashA, hashB)
	}
}

func TestEvidenceReceiptHashChangesWithContentHashes(t *testing.T) {
	t.Parallel()

	receipt := testEvidenceReceipt(hashBytes([]byte("args")), hashBytes([]byte("result")))
	baseHash, err := computeEvidenceReceiptHash(receipt)
	if err != nil {
		t.Fatalf("computeEvidenceReceiptHash() unexpected error: %v", err)
	}

	receipt.ArgsHash = hashBytes([]byte("different args"))
	argsHash, err := computeEvidenceReceiptHash(receipt)
	if err != nil {
		t.Fatalf("computeEvidenceReceiptHash() unexpected error: %v", err)
	}
	if argsHash == baseHash {
		t.Fatal("receipt hash should change when args_hash changes")
	}

	receipt = testEvidenceReceipt(hashBytes([]byte("args")), hashBytes([]byte("different result")))
	resultHash, err := computeEvidenceReceiptHash(receipt)
	if err != nil {
		t.Fatalf("computeEvidenceReceiptHash() unexpected error: %v", err)
	}
	if resultHash == baseHash {
		t.Fatal("receipt hash should change when result_hash changes")
	}
}

func TestNoopEvidenceReceiptRecorder(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	recorder := newEvidenceReceiptRecorder(dir, 10, false)
	err := recorder.RecordFinished(t.Context(), testEvidenceReceiptEvent())
	if err != nil {
		t.Fatalf("RecordFinished() unexpected error: %v", err)
	}

	path, err := evidenceReceiptsPath(dir, 10)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() unexpected error: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("disabled recorder should not create %s, stat err: %v", path, err)
	}
}

func TestFileEvidenceReceiptRecorderWritesJSONLAndLinksReceipts(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	recorder := newTestEvidenceReceiptRecorder(dir, 42)

	if err := recorder.RecordFinished(t.Context(), testEvidenceReceiptEvent()); err != nil {
		t.Fatalf("RecordFinished() unexpected error: %v", err)
	}
	if err := recorder.RecordFinished(t.Context(), evidenceReceiptEvent{
		FlowID:     42,
		ToolcallID: 101,
		CallID:     "call-101",
		ToolName:   "terminal",
		Args:       json.RawMessage(`{"cmd":"whoami"}`),
		Result:     "root",
	}); err != nil {
		t.Fatalf("RecordFinished() second receipt unexpected error: %v", err)
	}

	path, err := evidenceReceiptsPath(dir, 42)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() unexpected error: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read evidence receipts: %v", err)
	}
	if strings.Contains(string(data), "sensitive output") {
		t.Fatal("receipt file should not store raw result content")
	}
	receipts := readEvidenceReceiptLines(t, path)
	if len(receipts) != 2 {
		t.Fatalf("got %d receipts, want 2", len(receipts))
	}

	if receipts[0].Status != evidenceReceiptStatusFinished {
		t.Fatalf("first receipt status = %q, want %q", receipts[0].Status, evidenceReceiptStatusFinished)
	}
	if receipts[0].PreviousReceiptHash != "" {
		t.Fatalf("first receipt previous hash = %q, want empty", receipts[0].PreviousReceiptHash)
	}
	if receipts[1].PreviousReceiptHash != receipts[0].ReceiptHash {
		t.Fatalf("second receipt previous hash = %q, want %q", receipts[1].PreviousReceiptHash, receipts[0].ReceiptHash)
	}
}

func TestFileEvidenceReceiptRecorderRecordsFailedStatus(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	recorder := newTestEvidenceReceiptRecorder(dir, 77)

	if err := recorder.RecordFailed(t.Context(), testEvidenceReceiptEvent()); err != nil {
		t.Fatalf("RecordFailed() unexpected error: %v", err)
	}

	path, err := evidenceReceiptsPath(dir, 77)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() unexpected error: %v", err)
	}
	receipts := readEvidenceReceiptLines(t, path)
	if len(receipts) != 1 {
		t.Fatalf("got %d receipts, want 1", len(receipts))
	}
	if receipts[0].Status != evidenceReceiptStatusFailed {
		t.Fatalf("receipt status = %q, want %q", receipts[0].Status, evidenceReceiptStatusFailed)
	}
}

func TestFileEvidenceReceiptRecorderFailsClosedOnUnreadablePreviousReceipt(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path, err := evidenceReceiptsPath(dir, 88)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() unexpected error: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("failed to create evidence dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(`{"schema":"wrong"}`+"\n"), 0644); err != nil {
		t.Fatalf("failed to seed corrupt receipt: %v", err)
	}

	recorder := newTestEvidenceReceiptRecorder(dir, 88)
	err = recorder.RecordFinished(t.Context(), testEvidenceReceiptEvent())
	if err == nil {
		t.Fatal("RecordFinished() should fail when previous receipt cannot be verified")
	}
}

func testEvidenceReceipt(argsHash, resultHash string) evidenceReceipt {
	return evidenceReceipt{
		Schema:              evidenceReceiptSchema,
		Version:             evidenceReceiptVersion,
		ReceiptID:           "receipt_test",
		PreviousReceiptHash: "sha256:previous",
		FlowID:              42,
		ToolcallID:          100,
		CallID:              "call-100",
		ToolName:            "terminal",
		Status:              evidenceReceiptStatusFinished,
		ArgsHash:            argsHash,
		ResultHash:          resultHash,
		CreatedAt:           time.Date(2026, 4, 22, 12, 0, 0, 0, time.UTC),
	}
}

func testEvidenceReceiptEvent() evidenceReceiptEvent {
	taskID := int64(20)
	subtaskID := int64(30)

	return evidenceReceiptEvent{
		FlowID:     10,
		TaskID:     &taskID,
		SubtaskID:  &subtaskID,
		ToolcallID: 100,
		CallID:     "call-100",
		ToolName:   "terminal",
		Args:       json.RawMessage(`{"cmd":"id"}`),
		Result:     "sensitive output",
	}
}

func newTestEvidenceReceiptRecorder(dir string, flowID int64) *fileEvidenceReceiptRecorder {
	var count int

	return &fileEvidenceReceiptRecorder{
		dataDir: dir,
		flowID:  flowID,
		now: func() time.Time {
			count++
			return time.Date(2026, 4, 22, 12, 0, count, 0, time.UTC)
		},
		newID: func() string {
			return fmt.Sprintf("receipt_%03d", count+1)
		},
	}
}

func readEvidenceReceiptLines(t *testing.T, path string) []evidenceReceipt {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read evidence receipts: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	receipts := make([]evidenceReceipt, 0, len(lines))
	for _, line := range lines {
		var receipt evidenceReceipt
		if err := json.Unmarshal([]byte(line), &receipt); err != nil {
			t.Fatalf("failed to parse receipt line %q: %v", line, err)
		}
		receipts = append(receipts, receipt)
	}

	return receipts
}

func TestFileEvidenceReceiptRecorderSerializesConcurrentWritesToSamePath(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	const flowID = int64(4242)
	const writers = 2
	const perWriter = 40

	var wg sync.WaitGroup
	for w := 0; w < writers; w++ {
		recorder := newTestEvidenceReceiptRecorder(dir, flowID)
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < perWriter; i++ {
				if err := recorder.RecordFinished(t.Context(), testEvidenceReceiptEvent()); err != nil {
					t.Errorf("RecordFinished() error: %v", err)
					return
				}
			}
		}()
	}
	wg.Wait()

	path, err := evidenceReceiptsPath(dir, flowID)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() error: %v", err)
	}
	receipts := readEvidenceReceiptLines(t, path)

	if len(receipts) != writers*perWriter {
		t.Fatalf("got %d receipts, want %d", len(receipts), writers*perWriter)
	}
	if receipts[0].PreviousReceiptHash != "" {
		t.Fatalf("first receipt previous hash = %q, want empty", receipts[0].PreviousReceiptHash)
	}
	for i := 1; i < len(receipts); i++ {
		if receipts[i].PreviousReceiptHash != receipts[i-1].ReceiptHash {
			t.Fatalf("receipt %d chain broken: previous hash = %q, want %q (a concurrent write was not serialized)",
				i, receipts[i].PreviousReceiptHash, receipts[i-1].ReceiptHash)
		}
	}
}

func TestEvidenceReceiptPathLockBoundedRegardlessOfFlowCount(t *testing.T) {
	t.Parallel()

	const flows = 100_000
	if flows <= evidenceReceiptLockShards {
		t.Fatalf("test must exercise more than %d flows to prove the bound", evidenceReceiptLockShards)
	}

	mutexes := make(map[*sync.Mutex]struct{})
	for id := int64(0); id < flows; id++ {
		path, err := evidenceReceiptsPath("/data", id)
		if err != nil {
			t.Fatalf("evidenceReceiptsPath() error: %v", err)
		}
		mutexes[evidenceReceiptPathLock(path)] = struct{}{}
	}

	if len(mutexes) > evidenceReceiptLockShards {
		t.Fatalf("%d distinct flows produced %d distinct mutexes, want <= %d (a per-path map would leak one mutex per flow)",
			flows, len(mutexes), evidenceReceiptLockShards)
	}
}

func TestFileEvidenceReceiptRecorderSerializesHighConcurrencyToSamePath(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	const flowID = int64(9001)
	const writers = 16
	const perWriter = 24

	var wg sync.WaitGroup
	for w := 0; w < writers; w++ {
		recorder := newTestEvidenceReceiptRecorder(dir, flowID)
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < perWriter; i++ {
				if err := recorder.RecordFinished(t.Context(), testEvidenceReceiptEvent()); err != nil {
					t.Errorf("RecordFinished() error: %v", err)
					return
				}
			}
		}()
	}
	wg.Wait()

	path, err := evidenceReceiptsPath(dir, flowID)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() error: %v", err)
	}
	receipts := readEvidenceReceiptLines(t, path)
	if len(receipts) != writers*perWriter {
		t.Fatalf("got %d receipts, want %d", len(receipts), writers*perWriter)
	}
	for i := 1; i < len(receipts); i++ {
		if receipts[i].PreviousReceiptHash != receipts[i-1].ReceiptHash {
			t.Fatalf("receipt %d chain broken: previous hash = %q, want %q", i, receipts[i].PreviousReceiptHash, receipts[i-1].ReceiptHash)
		}
	}
}

func TestFileEvidenceReceiptRecorderKeepsChainsIntactWhenPathsShareAStripe(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	flowA, flowB := collidingStripeFlowIDs(t, dir)

	pathA, err := evidenceReceiptsPath(dir, flowA)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() error: %v", err)
	}
	pathB, err := evidenceReceiptsPath(dir, flowB)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() error: %v", err)
	}
	if evidenceReceiptPathLock(pathA) != evidenceReceiptPathLock(pathB) {
		t.Fatalf("flows %d and %d do not share a stripe", flowA, flowB)
	}

	const writers = 8
	const perWriter = 32
	var wg sync.WaitGroup
	for _, flowID := range []int64{flowA, flowB} {
		for w := 0; w < writers; w++ {
			recorder := newTestEvidenceReceiptRecorder(dir, flowID)
			wg.Add(1)
			go func() {
				defer wg.Done()
				for i := 0; i < perWriter; i++ {
					if err := recorder.RecordFinished(t.Context(), testEvidenceReceiptEvent()); err != nil {
						t.Errorf("RecordFinished() error: %v", err)
						return
					}
				}
			}()
		}
	}
	wg.Wait()

	for _, path := range []string{pathA, pathB} {
		receipts := readEvidenceReceiptLines(t, path)
		if len(receipts) != writers*perWriter {
			t.Fatalf("%s: got %d receipts, want %d", path, len(receipts), writers*perWriter)
		}
		for i := 1; i < len(receipts); i++ {
			if receipts[i].PreviousReceiptHash != receipts[i-1].ReceiptHash {
				t.Fatalf("%s: receipt %d chain broken", path, i)
			}
		}
	}
}

func TestReadLastEvidenceReceiptHashMatchesFullReadTail(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	const flowID = int64(555)
	const receipts = 500

	recorder := newTestEvidenceReceiptRecorder(dir, flowID)
	for i := 0; i < receipts; i++ {
		if err := recorder.RecordFinished(t.Context(), testEvidenceReceiptEvent()); err != nil {
			t.Fatalf("RecordFinished() error: %v", err)
		}
	}

	path, err := evidenceReceiptsPath(dir, flowID)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() error: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat error: %v", err)
	}
	if info.Size() <= 64*1024 {
		t.Fatalf("file is %d bytes; need > 64KiB to exercise the windowed tail read", info.Size())
	}

	full := readEvidenceReceiptLines(t, path)
	want := full[len(full)-1].ReceiptHash

	got, err := readLastEvidenceReceiptHash(path)
	if err != nil {
		t.Fatalf("readLastEvidenceReceiptHash() error: %v", err)
	}
	if got != want {
		t.Fatalf("tail hash = %q, want %q (must equal the last line of a full read)", got, want)
	}
}

func TestReadLastEvidenceReceiptHashEmptyOrMissingFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path, err := evidenceReceiptsPath(dir, 556)
	if err != nil {
		t.Fatalf("evidenceReceiptsPath() error: %v", err)
	}

	got, err := readLastEvidenceReceiptHash(path)
	if err != nil {
		t.Fatalf("missing file: unexpected error: %v", err)
	}
	if got != "" {
		t.Fatalf("missing file tail = %q, want empty", got)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("failed to create evidence dir: %v", err)
	}
	if err := os.WriteFile(path, nil, 0644); err != nil {
		t.Fatalf("failed to create empty file: %v", err)
	}

	got, err = readLastEvidenceReceiptHash(path)
	if err != nil {
		t.Fatalf("empty file: unexpected error: %v", err)
	}
	if got != "" {
		t.Fatalf("empty file tail = %q, want empty", got)
	}
}

func collidingStripeFlowIDs(t *testing.T, dir string) (int64, int64) {
	t.Helper()

	seen := make(map[*sync.Mutex]int64)
	for id := int64(0); id <= evidenceReceiptLockShards; id++ {
		path, err := evidenceReceiptsPath(dir, id)
		if err != nil {
			t.Fatalf("evidenceReceiptsPath() error: %v", err)
		}
		lock := evidenceReceiptPathLock(path)
		if other, ok := seen[lock]; ok {
			return other, id
		}
		seen[lock] = id
	}

	t.Fatalf("no two of the first %d flows share a stripe", evidenceReceiptLockShards+1)
	return 0, 0
}
