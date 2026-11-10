package coeli

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"
)

func createRun(s *State, mode, key, execution string, p Policy, now time.Time) (*Run, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}
	if key == "" || len(key) > 100 || !slices.Contains([]string{"purple", "observe", "audit", "attack", "defense", "maintenance", "release"}, mode) || !slices.Contains([]string{"internal", "external"}, execution) {
		return nil, ErrDenied
	}
	for _, r := range s.Runs {
		if r.Key == key {
			if r.Mode != mode || r.Policy != p || s.Tasks[r.Tasks[0]].Execution != execution {
				return nil, ErrConflict
			}
			return r, nil
		}
	}
	if len(s.Runs) >= 100 || s.Emergency {
		return nil, ErrDenied
	}
	stages := []string{"audit", "attack", "defend", "maintain", "retest", "evaluate", "remember"}
	switch mode {
	case "audit":
		stages = []string{"audit", "attack"}
	case "attack":
		stages = []string{"attack"}
	case "observe", "defense":
		stages = []string{"attack", "defend"}
	}
	r := &Run{ID: newID(), Key: key, Mode: mode, Status: "queued", Policy: p, CreatedAt: now, Deadline: now.Add(time.Duration(p.DurationSeconds) * time.Second), Version: "lab-idor-v1"}
	var previous string
	for _, stage := range stages {
		t := &Task{ID: newID(), RunID: r.ID, Stage: stage, Capability: capability(stage), Status: "queued", Execution: execution, DependsOn: previous}
		if stage == "evaluate" || stage == "remember" {
			t.Execution = "internal"
		}
		s.Tasks[t.ID] = t
		r.Tasks = append(r.Tasks, t.ID)
		previous = t.ID
	}
	s.Runs[r.ID] = r
	return r, nil
}
func recoverTasks(s *State, now time.Time) {
	for _, r := range s.Runs {
		if !terminal(r.Status) && now.After(r.Deadline) {
			r.Status = "inconclusive"
		}
		for _, id := range r.Tasks {
			t := s.Tasks[id]
			if terminal(r.Status) && !terminal(t.Status) {
				t.Status = r.Status
				t.Lease = ""
				continue
			}
			if t.Status == "leased" && !now.Before(t.LeaseUntil) {
				t.Lease = ""
				t.WorkerID = ""
				if t.Attempts >= r.Policy.MaxAttempts {
					t.Status = "inconclusive"
					r.Status = "inconclusive"
				} else {
					t.Status = "queued"
				}
			}
		}
	}
}
func claim(s *State, worker string, caps []string, environment, execution string, now time.Time) (*Task, error) {
	recoverTasks(s, now)
	if s.Emergency {
		return nil, ErrDenied
	}
	for _, r := range s.Runs {
		if terminal(r.Status) || r.Status == "paused" || r.Policy.Environment != environment {
			continue
		}
		active := 0
		for _, id := range r.Tasks {
			if s.Tasks[id].Status == "leased" {
				active++
			}
		}
		if active >= r.Policy.MaxConcurrency {
			continue
		}
		for _, id := range r.Tasks {
			t := s.Tasks[id]
			if t.Status != "queued" || t.Execution != execution || !slices.Contains(caps, t.Capability) {
				continue
			}
			if t.DependsOn != "" && s.Tasks[t.DependsOn].Status != "succeeded" {
				continue
			}
			identity := worker
			if execution == "internal" {
				identity = "internal-operator"
				if t.Stage == "maintain" {
					identity = "internal-maintainer"
				}
				if t.Stage == "evaluate" || t.Stage == "retest" || t.Stage == "remember" {
					identity = "internal-verifier"
				}
			}
			if t.Stage == "evaluate" && s.Tasks[t.DependsOn].WorkerID == identity && s.Tasks[t.DependsOn].Stage == "maintain" {
				return nil, ErrDenied
			}
			if r.Activities >= r.Policy.MaxActivities {
				r.Status = "inconclusive"
				return nil, nil
			}
			t.Status = "leased"
			t.WorkerID = identity
			t.Attempts++
			r.Activities++
			t.Lease = newID()
			t.LeaseUntil = now.Add(45 * time.Second)
			r.Status = "running"
			return t, nil
		}
	}
	return nil, nil
}
func leaseTask(s *State, id, worker, lease string, now time.Time) (*Task, error) {
	t := s.Tasks[id]
	if t == nil {
		return nil, ErrDenied
	}
	r := s.Runs[t.RunID]
	if s.Emergency || terminal(r.Status) || r.Status == "paused" || now.After(r.Deadline) || t.Status != "leased" || t.WorkerID != worker || t.Lease != lease || !now.Before(t.LeaseUntil) {
		return nil, ErrConflict
	}
	return t, nil
}
func complete(s *State, id, worker, lease, outcome string, result json.RawMessage, receipt string, now time.Time) error {
	if !slices.Contains([]string{"succeeded", "failed", "cancelled", "inconclusive"}, outcome) || len(result) > 64*1024 || !json.Valid(result) {
		return ErrDenied
	}
	t := s.Tasks[id]
	if t == nil {
		return ErrDenied
	}
	// JSONB rewrites result bytes; the persisted receipt binds the original submission.
	if terminal(t.Status) && t.WorkerID == worker && t.Receipt == receipt && receipt != "" && digest(result) == receipt && t.Outcome == outcome {
		return nil
	}
	t, err := leaseTask(s, id, worker, lease, now)
	if err != nil {
		return err
	}
	t.Status = outcome
	t.Outcome = outcome
	t.Result = result
	t.Receipt = receipt
	t.Lease = ""
	r := s.Runs[t.RunID]
	if outcome != "succeeded" {
		r.Status = outcome
		return nil
	}
	done := true
	for _, tid := range r.Tasks {
		if s.Tasks[tid].Status != "succeeded" {
			done = false
		}
	}
	if done {
		r.Status = "succeeded"
	}
	return nil
}
func ingest(s *State, e Telemetry, now time.Time) error {
	r := s.Runs[e.RunID]
	if r == nil || e.ID == "" || len(e.ID) > 100 || e.SchemaVersion != "coeli.telemetry.v1" || e.Asset != r.Policy.Asset || e.Source != "coeli-lab" || e.Timestamp.Before(now.Add(-24*time.Hour)) || e.Timestamp.After(now.Add(time.Minute)) || !slices.Contains([]string{"cross_owner_access", "legitimate_access"}, e.Kind) || !slices.Contains([]int{200, 403}, e.Status) {
		return ErrDenied
	}
	key := e.RunID + ":" + e.ID
	if s.Events[key] {
		return nil
	}
	if len(s.Events) >= 10000 {
		return ErrDenied
	}
	s.Events[key] = true
	if e.Kind == "cross_owner_access" {
		for _, i := range s.Incidents {
			if i.RunID == e.RunID && i.Rule == "cross-owner-v1" {
				return nil
			}
		}
		i := &Incident{ID: newID(), RunID: e.RunID, EventID: e.ID, Asset: e.Asset, Rule: "cross-owner-v1", Status: "investigating", DetectedAt: now}
		s.Incidents[i.ID] = i
	}
	return nil
}
func validateResult(t *Task, result json.RawMessage) error {
	if !json.Valid(result) || len(result) > 64*1024 {
		return ErrDenied
	}
	text := strings.ToLower(string(result))
	for _, secret := range []string{"authorization: bearer", "sk-ant-", "-----begin private key", "password=", "sk-proj-"} {
		if strings.Contains(text, secret) {
			return fmt.Errorf("%w: secret-like content refused", ErrDenied)
		}
	}
	var envelope struct {
		SchemaVersion string `json:"schema_version"`
	}
	if json.Unmarshal(result, &envelope) != nil {
		return ErrDenied
	}
	if envelope.SchemaVersion == "coeli.audit.v1" {
		if _, err := ImportAuditCandidate(result); err != nil {
			return err
		}
	} else if envelope.SchemaVersion != "coeli.result.v1" {
		return ErrDenied
	}
	if t.Stage == "evaluate" || t.Stage == "remember" {
		return ErrDenied
	}
	return nil
}
