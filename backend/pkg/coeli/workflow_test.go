package coeli

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestWorkflow_CreateRun_ScopeDeduplicationAndBudget(t *testing.T) {
	s := NewState()
	now := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	p := DefaultPolicy("production")
	if _, err := createRun(s, "purple", "prod", "internal", p, now); !errors.Is(err, ErrDenied) {
		t.Fatalf("production: %v", err)
	}
	p = DefaultPolicy("laboratory")
	r, err := createRun(s, "purple", "round-1", "internal", p, now)
	if err != nil {
		t.Fatal(err)
	}
	again, err := createRun(s, "purple", "round-1", "internal", p, now)
	if err != nil || r.ID != again.ID || len(s.Runs) != 1 {
		t.Fatal("deduplication failed")
	}
	p.Asset = "external.invalid"
	if _, err := createRun(s, "purple", "outside", "internal", p, now); !errors.Is(err, ErrDenied) {
		t.Fatalf("outside: %v", err)
	}
	task, err := claim(s, "scheduler", []string{"audit.v1"}, "laboratory", "internal", now)
	if err != nil || task == nil {
		t.Fatalf("claim: %v", err)
	}
	if duplicate, _ := claim(s, "scheduler", []string{"audit.v1"}, "laboratory", "internal", now); duplicate != nil {
		t.Fatal("concurrency limit failed")
	}
	r.Status = "cancelled"
	recoverTasks(s, now)
	if task.Status != "cancelled" {
		t.Fatal("cancelled task remains active")
	}
	if err := complete(s, task.ID, task.WorkerID, task.Lease, "succeeded", json.RawMessage(`{}`), "r", now); !errors.Is(err, ErrConflict) {
		t.Fatalf("cancel: %v", err)
	}
}
func TestWorkflow_Lease_RecoveryAndCompletion(t *testing.T) {
	s := NewState()
	now := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	r, err := createRun(s, "attack", "lease-test", "external", DefaultPolicy("laboratory"), now)
	if err != nil {
		t.Fatal(err)
	}
	first, _ := claim(s, "worker-a", []string{"infrastructure.v1"}, "laboratory", "external", now)
	old := first.Lease
	recoverTasks(s, now.Add(46*time.Second))
	second, _ := claim(s, "worker-b", []string{"infrastructure.v1"}, "laboratory", "external", now.Add(46*time.Second))
	if second == nil || second.ID != first.ID || second.Lease == old {
		t.Fatal("lease was not recovered")
	}
	result := json.RawMessage(`{"status":"candidate"}`)
	if err := complete(s, second.ID, "worker-a", old, "succeeded", result, digest(result), now.Add(47*time.Second)); !errors.Is(err, ErrConflict) {
		t.Fatalf("old lease: %v", err)
	}
	lease := second.Lease
	if err := complete(s, second.ID, "worker-b", lease, "succeeded", result, digest(result), now.Add(47*time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := complete(s, second.ID, "worker-b", lease, "succeeded", result, digest(result), now.Add(48*time.Second)); err != nil {
		t.Fatal(err)
	}
	if r.Status != "succeeded" {
		t.Fatal("run not complete")
	}
}
func TestWorkflow_Ingest_DeduplicationAndOrganizationIsolation(t *testing.T) {
	a, b := NewState(), NewState()
	now := time.Now().UTC()
	r, _ := createRun(a, "observe", "observe", "internal", DefaultPolicy("laboratory"), now)
	event := Telemetry{ID: "event-1", SchemaVersion: "coeli.telemetry.v1", RunID: r.ID, Timestamp: now, Source: "coeli-lab", Asset: "synthetic-records", Kind: "cross_owner_access", Status: 200}
	if err := ingest(a, event, now); err != nil {
		t.Fatal(err)
	}
	if err := ingest(a, event, now); err != nil {
		t.Fatal(err)
	}
	if len(a.Incidents) != 1 || len(a.Events) != 1 {
		t.Fatal("duplicate incident")
	}
	if err := ingest(b, event, now); !errors.Is(err, ErrDenied) {
		t.Fatalf("organization leak: %v", err)
	}
}
func TestWorkflow_EncodeState_KeepsSecretsOutOfAPI(t *testing.T) {
	s := NewState()
	s.Workers["w"] = &Worker{ID: "w", TokenHash: strings.Repeat("secret", 10)}
	s.Tasks["t"] = &Task{ID: "t", Lease: "private-lease"}
	public, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(public), "secret") || strings.Contains(string(public), "private-lease") {
		t.Fatal("secret in API")
	}
	stored, err := encodeState(s)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := decodeState(stored)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Tasks["t"].Lease != "private-lease" || loaded.Workers["w"].TokenHash != s.Workers["w"].TokenHash {
		t.Fatal("secrets lost on restart")
	}
}
