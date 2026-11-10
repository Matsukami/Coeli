package coeli

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

type Engine struct {
	Store    Store
	Executor *Executor
}

func (e *Engine) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				e.Tick(ctx)
			}
		}
	}()
}
func (e *Engine) Tick(ctx context.Context) {
	owners, err := e.Store.Owners(ctx)
	if err != nil {
		return
	}
	for _, owner := range owners {
		var task *Task
		var run Run
		err := e.Store.Update(ctx, owner, "internal-scheduler", "tick", "", func(s *State) error {
			recoverTasks(s, time.Now())
			caps := []string{"audit.v1", "development.v1", "infrastructure.v1", "verification.v1"}
			for _, environment := range []string{"laboratory", "staging"} {
				t, err := claim(s, "internal-executor", caps, environment, "internal", time.Now())
				if err != nil {
					return nil
				}
				if t != nil {
					copy := *t
					task = &copy
					run = *s.Runs[t.RunID]
					break
				}
			}
			return nil
		})
		if err != nil || task == nil {
			continue
		}
		e.execute(ctx, owner, run, *task)
	}
}
func (e *Engine) execute(ctx context.Context, owner int64, run Run, task Task) {
	// The durable lease is checked again immediately before project-owned effects.
	err := e.Store.Update(ctx, owner, "internal-executor", "precondition", task.ID, func(s *State) error {
		_, err := leaseTask(s, task.ID, task.WorkerID, task.Lease, time.Now())
		return err
	})
	if err != nil {
		return
	}
	var result json.RawMessage
	if run.FlowID != 0 && task.Stage == "attack" {
		result, err = e.pentagiResult(ctx, owner, run.FlowID)
	} else {
		result, err = e.Executor.Execute(ctx, owner, run, task)
	}
	outcome := "succeeded"
	if err != nil {
		outcome = "inconclusive"
		result = json.RawMessage(`{"error":"activity failed or unavailable; inspect installation and laboratory permissions"}`)
	}
	sha, artifactErr := e.Executor.PutArtifact(owner, run.ID, result)
	if artifactErr != nil {
		return
	}
	_ = e.Store.Update(ctx, owner, "internal-executor", "complete", task.ID, func(s *State) error {
		if err := complete(s, task.ID, task.WorkerID, task.Lease, outcome, result, digest(result), time.Now()); err != nil {
			return err
		}
		var observed struct {
			Fingerprint string `json:"fingerprint"`
		}
		if json.Unmarshal(result, &observed) == nil && observed.Fingerprint != "" {
			s.Runs[run.ID].Version = observed.Fingerprint
		}
		evidence := &Evidence{ID: newID(), RunID: run.ID, TaskID: task.ID, SHA256: sha, Size: len(result), Kind: "activity", Version: s.Runs[run.ID].Version, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(30 * 24 * time.Hour), Status: "observed"}
		s.Evidence[evidence.ID] = evidence
		if outcome == "succeeded" {
			e.derive(s, run, task, result, evidence.ID)
		}
		return nil
	})
}
func (e *Engine) pentagiResult(ctx context.Context, owner, flowID int64) (json.RawMessage, error) {
	var status, model, provider string
	err := e.Store.Pool.QueryRow(ctx, "SELECT status, model, model_provider_name FROM flows WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL", flowID, owner).Scan(&status, &model, &provider)
	if err != nil {
		return nil, err
	}
	if status != "finished" {
		return nil, fmt.Errorf("PentAGI flow is not finished")
	}
	return json.Marshal(map[string]any{"source": "pentagi-real-flow", "flow_id": flowID, "status": status, "model": model, "provider": provider, "verification": "offensive execution recorded; findings require independent verification"})
}
func (e *Engine) derive(s *State, r Run, t Task, b json.RawMessage, evidenceID string) {
	var result struct {
		Events     []Telemetry     `json:"events"`
		Finding    json.RawMessage `json:"finding"`
		Patch      json.RawMessage `json:"patch"`
		Evaluation struct {
			Decision            string `json:"decision"`
			CorrectionConfirmed bool   `json:"correction_confirmed"`
		} `json:"evaluation"`
		Knowledge           json.RawMessage `json:"knowledge"`
		Action              string          `json:"action"`
		ContainmentVerified bool            `json:"containment_verified"`
	}
	if json.Unmarshal(b, &result) != nil {
		return
	}
	for _, event := range result.Events {
		event.RunID = r.ID
		_ = ingest(s, event, time.Now())
	}
	kind, status := "", ""
	switch t.Stage {
	case "audit":
		kind = "finding"
		status = "hypothesis"
	case "attack":
		if len(result.Finding) > 0 {
			kind = "finding"
			status = "confirmed"
		}
	case "defend":
		kind = "containment"
		status = "would_execute"
		if result.Action == "executed" && result.ContainmentVerified {
			status = "verified_and_reversed"
		}
		for _, i := range s.Incidents {
			if i.RunID == r.ID {
				i.Status = status
			}
		}
	case "maintain":
		kind = "patch"
		status = "prepared"
	case "retest":
		kind = "retest"
		status = result.Evaluation.Decision
	case "evaluate":
		kind = "release"
		status = result.Evaluation.Decision
	case "remember":
		kind = "knowledge"
		status = "validated"
	}
	if kind != "" {
		record := &Record{ID: newID(), RunID: r.ID, Kind: kind, Status: status, EvidenceIDs: []string{evidenceID}, Data: b}
		s.Records[record.ID] = record
	}
}
