package coeli

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"pentagi/pkg/providers"
	"pentagi/pkg/providers/pconfig"
	"pentagi/pkg/providers/provider"

	"github.com/gin-gonic/gin"
)

type Service struct {
	Engine    *Engine
	Providers providers.ProviderController
}

func Register(user, worker *gin.RouterGroup, db Store, pc providers.ProviderController, namespace string) {
	svc := &Service{Providers: pc}
	if os.Getenv("COELI_ENABLED") == "true" && os.Getenv("COELI_ROOT") != "" && os.Getenv("COELI_RUNTIME") != "" {
		executor, err := NewExecutor(os.Getenv("COELI_ROOT"), filepath.Join(os.Getenv("COELI_RUNTIME"), namespace))
		if err == nil {
			svc.Engine = &Engine{Store: db, Executor: executor}
			svc.Engine.Start(context.Background())
		}
	}
	user.GET("/connections", svc.connections)
	user.Use(func(c *gin.Context) {
		if svc.Engine == nil {
			c.AbortWithStatusJSON(503, gin.H{"error": "Coeli unavailable: configure COELI_ENABLED, COELI_ROOT, COELI_RUNTIME and Node 24"})
			return
		}
		c.Next()
	})
	user.GET("/state", svc.state)
	user.POST("/runs", svc.create)
	user.POST("/runs/:id/control", svc.control)
	user.POST("/emergency", svc.emergency)
	user.POST("/workers", svc.registerWorker)
	user.POST("/workers/:id/revoke", svc.revokeWorker)
	user.GET("/evidence/:id", svc.evidence)
	user.POST("/models", svc.bindModel)
	user.POST("/models/test", svc.testModel)
	user.GET("/compare", svc.compare)
	worker.Use(func(c *gin.Context) {
		if svc.Engine == nil {
			c.AbortWithStatus(503)
			return
		}
		c.Next()
	}, svc.workerAuth)
	worker.POST("/claim", svc.workerClaim)
	worker.POST("/tasks/:id/heartbeat", svc.heartbeat)
	worker.POST("/tasks/:id/evidence", svc.workerEvidence)
	worker.POST("/tasks/:id/result", svc.workerResult)
	worker.POST("/telemetry", svc.telemetry)
}
func owner(c *gin.Context) int64 { return int64(c.GetUint64("uid")) }
func reply(c *gin.Context, err error, value any) {
	if err != nil {
		code := 500
		message := "operation failed"
		if errors.Is(err, ErrDenied) {
			code = 403
			message = err.Error()
		}
		if errors.Is(err, ErrConflict) {
			code = 409
			message = err.Error()
		}
		if errors.Is(err, ErrUnavailable) {
			code = 503
			message = err.Error()
		}
		c.JSON(code, gin.H{"error": message})
		return
	}
	c.JSON(200, value)
}
func body(c *gin.Context, value any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 96*1024)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil {
		c.AbortWithStatusJSON(400, gin.H{"error": "invalid request schema"})
		return false
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		c.AbortWithStatusJSON(400, gin.H{"error": "trailing JSON content refused"})
		return false
	}
	return true
}
func (s *Service) connections(c *gin.Context) {
	c.JSON(200, gin.H{"enabled": s.Engine != nil, "environment": "laboratory", "production": "disabled", "pentagi": "existing flow bridge; separate original policies", "claude_code": "unavailable: external connector pending", "gpt_cyber": "unavailable: installation access and third-party contractual conditions unconfirmed", "cloudflare": "source-only candidate adapter; sandbox validation pending", "models": "PentAGI providers, explicit synthetic-only test, no cross-provider fallback"})
}
func (s *Service) state(c *gin.Context) {
	id := owner(c)
	if id <= 0 {
		reply(c, ErrDenied, nil)
		return
	}
	err := s.Engine.Store.Update(c, id, userActor(id), "initialize", "", func(*State) error { return nil })
	if err != nil {
		reply(c, err, nil)
		return
	}
	state, err := s.Engine.Store.Read(c, id)
	if err == nil {
		for _, evidence := range state.Evidence {
			if time.Now().After(evidence.ExpiresAt) {
				evidence.Status = "stale"
			}
		}
		for _, record := range state.Records {
			for _, id := range record.EvidenceIDs {
				if ev := state.Evidence[id]; ev != nil && ev.Status == "stale" {
					record.Status = "stale"
				}
			}
		}
	}
	reply(c, err, state)
}
func (s *Service) create(c *gin.Context) {
	var input struct {
		Mode      string `json:"mode"`
		Key       string `json:"deduplication_key"`
		Execution string `json:"execution"`
		Policy    Policy `json:"policy"`
		FlowID    int64  `json:"pentagi_flow_id"`
	}
	if !body(c, &input) {
		return
	}
	if input.Execution == "" {
		input.Execution = "internal"
	}
	id := owner(c)
	if id <= 0 {
		reply(c, ErrDenied, nil)
		return
	}
	if input.FlowID != 0 {
		if input.Mode != "attack" || input.Execution != "internal" {
			reply(c, ErrDenied, nil)
			return
		}
		var flow int64
		if err := s.Engine.Store.Pool.QueryRow(c, "SELECT id FROM flows WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL", input.FlowID, id).Scan(&flow); err != nil {
			reply(c, ErrDenied, nil)
			return
		}
	}
	var run *Run
	err := s.Engine.Store.Update(c, id, userActor(id), "create-run", input.Key, func(state *State) error {
		for _, old := range state.Runs {
			if old.Key == input.Key && old.FlowID != input.FlowID {
				return ErrConflict
			}
		}
		var err error
		run, err = createRun(state, input.Mode, input.Key, input.Execution, input.Policy, time.Now())
		if err != nil {
			return err
		}
		if run.FlowID != 0 && run.FlowID != input.FlowID {
			return ErrConflict
		}
		run.FlowID = input.FlowID
		return nil
	})
	reply(c, err, run)
}
func (s *Service) control(c *gin.Context) {
	var input struct {
		Action string `json:"action"`
	}
	if !body(c, &input) {
		return
	}
	err := s.Engine.Store.Update(c, owner(c), userActor(owner(c)), "run-control", c.Param("id"), func(state *State) error {
		r := state.Runs[c.Param("id")]
		if r == nil || terminal(r.Status) {
			return ErrConflict
		}
		switch input.Action {
		case "pause":
			r.Status = "paused"
		case "resume":
			if r.Status != "paused" {
				return ErrConflict
			}
			r.Status = "queued"
		case "cancel":
			r.Status = "cancelled"
			recoverTasks(state, time.Now())
		default:
			return ErrDenied
		}
		return nil
	})
	reply(c, err, gin.H{"action": input.Action})
}
func (s *Service) emergency(c *gin.Context) {
	var input struct {
		Enabled bool `json:"enabled"`
	}
	if !body(c, &input) {
		return
	}
	err := s.Engine.Store.Update(c, owner(c), userActor(owner(c)), "emergency", "", func(state *State) error {
		state.Emergency = input.Enabled
		for _, r := range state.Runs {
			if input.Enabled && !terminal(r.Status) {
				r.Status = "cancelled"
			}
		}
		recoverTasks(state, time.Now())
		return nil
	})
	reply(c, err, gin.H{"enabled": input.Enabled})
}

var capabilities = []string{"development.v1", "database.v1", "infrastructure.v1", "audit.v1", "verification.v1", "telemetry.v1"}

func (s *Service) registerWorker(c *gin.Context) {
	var input struct {
		Name         string   `json:"name"`
		Capabilities []string `json:"capabilities"`
		Environment  string   `json:"environment"`
	}
	if !body(c, &input) {
		return
	}
	if len(input.Name) < 1 || len(input.Name) > 80 || len(input.Capabilities) < 1 || len(input.Capabilities) > 6 || !slices.Contains([]string{"laboratory", "staging"}, input.Environment) {
		reply(c, ErrDenied, nil)
		return
	}
	for _, cap := range input.Capabilities {
		if !slices.Contains(capabilities, cap) {
			reply(c, ErrDenied, nil)
			return
		}
	}
	token := newID()
	w := &Worker{ID: newID(), Name: input.Name, TokenHash: digest([]byte(token)), Capabilities: input.Capabilities, Environment: input.Environment, LastSeen: time.Now()}
	err := s.Engine.Store.Update(c, owner(c), userActor(owner(c)), "register-worker", w.ID, func(state *State) error {
		if len(state.Workers) >= 100 {
			return ErrDenied
		}
		state.Workers[w.ID] = w
		return nil
	})
	reply(c, err, gin.H{"worker": w, "token": token, "owner_id": owner(c), "schema_version": ContractVersion})
}
func (s *Service) revokeWorker(c *gin.Context) {
	err := s.Engine.Store.Update(c, owner(c), userActor(owner(c)), "revoke-worker", c.Param("id"), func(state *State) error {
		w := state.Workers[c.Param("id")]
		if w == nil {
			return ErrDenied
		}
		w.Revoked = true
		return nil
	})
	reply(c, err, gin.H{"revoked": true})
}
func (s *Service) workerAuth(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("owner"), 10, 64)
	if err != nil || id <= 0 {
		c.AbortWithStatus(401)
		return
	}
	state, err := s.Engine.Store.Read(c, id)
	if err != nil {
		c.AbortWithStatus(401)
		return
	}
	w := state.Workers[c.GetHeader("X-Coeli-Worker")]
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	actual := digest([]byte(token))
	if w == nil || w.Revoked || len(token) != 48 || subtle.ConstantTimeCompare([]byte(w.TokenHash), []byte(actual)) != 1 {
		c.AbortWithStatus(401)
		return
	}
	c.Set("coeli_owner", id)
	c.Set("coeli_worker", *w)
	c.Next()
}
func workerContext(c *gin.Context) (int64, Worker) {
	id, _ := c.Get("coeli_owner")
	w, _ := c.Get("coeli_worker")
	return id.(int64), w.(Worker)
}
func (s *Service) workerClaim(c *gin.Context) {
	id, w := workerContext(c)
	var task *Task
	err := s.Engine.Store.Update(c, id, w.ID, "claim", "", func(state *State) error {
		var err error
		task, err = claim(state, w.ID, w.Capabilities, w.Environment, "external", time.Now())
		state.Workers[w.ID].LastSeen = time.Now()
		return err
	})
	if task == nil {
		reply(c, err, gin.H{"task": nil, "schema_version": ContractVersion})
		return
	}
	reply(c, err, gin.H{"task": task, "lease": task.Lease, "schema_version": ContractVersion, "payload": gin.H{"asset": "synthetic-records", "environment": w.Environment, "data_policy": "synthetic-only", "effects": "none: return candidate evidence; privileged effects remain internal"}})
}
func (s *Service) heartbeat(c *gin.Context) {
	var input struct {
		Lease    string `json:"lease"`
		Progress string `json:"progress"`
	}
	if !body(c, &input) {
		return
	}
	id, w := workerContext(c)
	if len(input.Progress) > 240 {
		reply(c, ErrDenied, nil)
		return
	}
	err := s.Engine.Store.Update(c, id, w.ID, "heartbeat", c.Param("id"), func(state *State) error {
		t, err := leaseTask(state, c.Param("id"), w.ID, input.Lease, time.Now())
		if err != nil {
			return err
		}
		t.LeaseUntil = time.Now().Add(45 * time.Second)
		t.Progress = input.Progress
		state.Workers[w.ID].LastSeen = time.Now()
		return nil
	})
	reply(c, err, gin.H{"cancel_requested": err != nil})
}
func (s *Service) workerResult(c *gin.Context) {
	var input struct {
		Lease   string          `json:"lease"`
		Outcome string          `json:"outcome"`
		Result  json.RawMessage `json:"result"`
		Receipt string          `json:"receipt"`
	}
	if !body(c, &input) {
		return
	}
	id, w := workerContext(c)
	err := s.Engine.Store.Update(c, id, w.ID, "worker-result", c.Param("id"), func(state *State) error {
		t := state.Tasks[c.Param("id")]
		if t == nil {
			return ErrDenied
		}
		if err := validateResult(t, input.Result); err != nil {
			return err
		}
		if input.Receipt != digest(input.Result) {
			return ErrDenied
		}
		return complete(state, t.ID, w.ID, input.Lease, input.Outcome, input.Result, input.Receipt, time.Now())
	})
	reply(c, err, gin.H{"accepted": err == nil, "validation": "candidate; no promotion to verified memory"})
}
func (s *Service) workerEvidence(c *gin.Context) {
	var input struct {
		Lease   string          `json:"lease"`
		Content json.RawMessage `json:"content"`
	}
	if !body(c, &input) {
		return
	}
	id, w := workerContext(c)
	var ev *Evidence
	err := s.Engine.Store.Update(c, id, w.ID, "worker-evidence", c.Param("id"), func(state *State) error {
		t, err := leaseTask(state, c.Param("id"), w.ID, input.Lease, time.Now())
		if err != nil {
			return err
		}
		if err := validateResult(t, input.Content); err != nil {
			return err
		}
		sha, err := s.Engine.Executor.PutArtifact(id, t.RunID, input.Content)
		if err != nil {
			return err
		}
		ev = &Evidence{ID: newID(), RunID: t.RunID, TaskID: t.ID, SHA256: sha, Size: len(input.Content), Kind: "worker-candidate", Version: state.Runs[t.RunID].Version, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(30 * 24 * time.Hour), Status: "hypothesis"}
		state.Evidence[ev.ID] = ev
		return nil
	})
	reply(c, err, ev)
}
func (s *Service) evidence(c *gin.Context) {
	state, err := s.Engine.Store.Read(c, owner(c))
	if err != nil {
		reply(c, err, nil)
		return
	}
	ev := state.Evidence[c.Param("id")]
	if ev == nil {
		reply(c, ErrDenied, nil)
		return
	}
	content, err := s.Engine.Executor.Artifact(owner(c), *ev)
	if err != nil {
		reply(c, err, nil)
		return
	}
	c.Header("Content-Disposition", "attachment; filename=evidence.json")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(200, "application/json", content)
}
func (s *Service) telemetry(c *gin.Context) {
	id, w := workerContext(c)
	if !slices.Contains(w.Capabilities, "telemetry.v1") {
		reply(c, ErrDenied, nil)
		return
	}
	var input Telemetry
	if !body(c, &input) {
		return
	}
	err := s.Engine.Store.Update(c, id, w.ID, "ingest", input.ID, func(state *State) error {
		r := state.Runs[input.RunID]
		if r == nil || r.Policy.Environment != w.Environment {
			return ErrDenied
		}
		return ingest(state, input, time.Now())
	})
	reply(c, err, gin.H{"accepted": err == nil})
}
func (s *Service) bindModel(c *gin.Context) {
	var input ModelBinding
	if !body(c, &input) {
		return
	}
	if !slices.Contains([]string{"audit", "defense", "maintenance", "verification"}, input.Role) || !slices.Contains([]string{"laboratory", "staging"}, input.Environment) || input.TimeoutSeconds < 1 || input.TimeoutSeconds > 30 || input.MaxCalls < 1 || input.MaxCalls > 10 || input.Calls != 0 || input.Retries != 0 || input.DataPolicy != "synthetic-only" || input.Fallback != "none" || strings.Contains(strings.ToLower(input.Provider), "cyber") {
		reply(c, ErrDenied, nil)
		return
	}
	selected, err := s.Providers.GetProvider(c, provider.ProviderName(input.Provider), owner(c))
	if err != nil || !generalModelAllowed(selected) {
		reply(c, ErrUnavailable, nil)
		return
	}
	err = s.Engine.Store.Update(c, owner(c), userActor(owner(c)), "bind-model", input.Role, func(state *State) error {
		key := input.Environment + ":" + input.Role
		if old := state.Models[key]; old != nil {
			input.Calls = old.Calls
		}
		state.Models[key] = &input
		return nil
	})
	reply(c, err, input)
}
func (s *Service) testModel(c *gin.Context) {
	var input struct {
		Role        string `json:"role"`
		Environment string `json:"environment"`
	}
	if !body(c, &input) {
		return
	}
	var binding ModelBinding
	err := s.Engine.Store.Update(c, owner(c), userActor(owner(c)), "model-test-reserve", input.Role, func(state *State) error {
		b := state.Models[input.Environment+":"+input.Role]
		if b == nil || b.Calls >= b.MaxCalls || state.Emergency {
			return ErrDenied
		}
		b.Calls++
		binding = *b
		return nil
	})
	if err != nil {
		reply(c, err, nil)
		return
	}
	ctx, cancel := context.WithTimeout(c, time.Duration(binding.TimeoutSeconds)*time.Second)
	defer cancel()
	p, err := s.Providers.GetProvider(ctx, provider.ProviderName(binding.Provider), owner(c))
	if err != nil || !generalModelAllowed(p) {
		reply(c, ErrUnavailable, nil)
		return
	}
	p = provider.WithoutFailover(p)
	_, err = p.Call(ctx, pconfig.OptionsTypeSimple, "Return only OK. This is a synthetic Coeli laboratory connectivity test; no customer data is supplied.")
	status := "available"
	if err != nil {
		status = "unavailable"
	}
	_ = s.Engine.Store.Update(c, owner(c), userActor(owner(c)), "model-test-result", input.Role, func(state *State) error {
		data, _ := json.Marshal(map[string]any{"status": status, "model": p.Model(pconfig.OptionsTypeSimple), "configuration": binding, "timestamp": time.Now()})
		record := &Record{ID: newID(), Kind: "model_activity", Status: status, Data: data}
		state.Records[record.ID] = record
		return nil
	})
	c.JSON(200, gin.H{"status": status, "provider": binding.Provider, "model": p.Model(pconfig.OptionsTypeSimple), "data_policy": binding.DataPolicy, "fallback": "none"})
}
func (s *Service) compare(c *gin.Context) {
	state, err := s.Engine.Store.Read(c, owner(c))
	if err != nil {
		reply(c, err, nil)
		return
	}
	a, b := state.Runs[c.Query("a")], state.Runs[c.Query("b")]
	if a == nil || b == nil {
		reply(c, ErrDenied, nil)
		return
	}
	comparable := a.Policy == b.Policy && a.Version == b.Version && a.Mode == b.Mode && a.FlowID == 0 && b.FlowID == 0
	c.JSON(200, gin.H{"a": a, "b": b, "comparable": comparable, "attribution": "No AI improvement attribution; deterministic fixture, rule cross-owner-v1, model none. Different environments/modes/versions invalidate comparison."})
}

func generalModelAllowed(p provider.Provider) bool {
	if p == nil {
		return false
	}
	name := strings.ToLower(p.Model(pconfig.OptionsTypeSimple))
	return !strings.Contains(name, "cyber") && !strings.Contains(name, "daybreak")
}
