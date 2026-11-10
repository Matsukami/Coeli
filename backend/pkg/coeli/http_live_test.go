//go:build postgres

package coeli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestHTTP_Workflow_DatabaseExecutorAndWorkerTransport(t *testing.T) {
	store, ctx := liveStore(t)
	root, err := filepath.Abs("../../../coeli")
	if err != nil {
		t.Fatal(err)
	}
	executor, err := NewExecutor(root, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	engine := &Engine{Store: store, Executor: executor}
	service := &Service{Engine: engine}
	router := gin.New()
	// The harness supplies the authenticated UID; PentAGI login is tested separately.
	user := router.Group("/user", func(c *gin.Context) { c.Set("uid", uint64(1)) })
	user.POST("/runs", service.create)
	user.POST("/workers", service.registerWorker)
	user.POST("/workers/:id/revoke", service.revokeWorker)
	user.POST("/runs/:id/control", service.control)
	user.GET("/evidence/:id", service.evidence)
	worker := router.Group("/worker/:owner", service.workerAuth)
	worker.POST("/claim", service.workerClaim)
	worker.POST("/tasks/:id/heartbeat", service.heartbeat)
	worker.POST("/tasks/:id/evidence", service.workerEvidence)
	worker.POST("/tasks/:id/result", service.workerResult)
	server := httptest.NewServer(router)
	defer server.Close()
	client := &http.Client{Timeout: 10 * time.Second}
	var token, workerID string
	request := func(path string, payload any, status int, result any) {
		t.Helper()
		data, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		method := http.MethodPost
		if payload == nil {
			method = http.MethodGet
		}
		req, err := http.NewRequestWithContext(ctx, method, server.URL+path, bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("X-Coeli-Worker", workerID)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		content, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != status {
			t.Fatalf("%s: got %d, want %d: %s", path, resp.StatusCode, status, content)
		}
		if result != nil && json.Unmarshal(content, result) != nil {
			t.Fatalf("invalid response for %s", path)
		}
	}
	for _, scenario := range []struct {
		mode, environment string
		tasks             int
	}{{"purple", "laboratory", 7}, {"observe", "laboratory", 2}, {"release", "staging", 7}} {
		var run Run
		request("/user/runs", map[string]any{"mode": scenario.mode, "deduplication_key": scenario.mode, "policy": DefaultPolicy(scenario.environment)}, 200, &run)
		for i := 0; i < scenario.tasks; i++ {
			// Recreate the engine between activities to exercise persisted checkpoints.
			engine = &Engine{Store: Store{Pool: store.Pool}, Executor: executor}
			engine.Tick(ctx)
		}
		state, err := store.Read(ctx, 1)
		if err != nil {
			t.Fatal(err)
		}
		if state.Runs[run.ID].Status != "succeeded" {
			t.Fatalf("%s: %+v", scenario.mode, state.Runs[run.ID])
		}
		kinds := map[string]string{}
		for _, record := range state.Records {
			if record.RunID == run.ID {
				kinds[record.Kind] = record.Status
			}
		}
		if scenario.mode == "observe" {
			if kinds["containment"] != "would_execute" {
				t.Fatalf("observation: %v", kinds)
			}
		} else if kinds["knowledge"] != "validated" || kinds["release"] != "approved" || kinds["containment"] != "verified_and_reversed" {
			t.Fatalf("%s records: %v", scenario.mode, kinds)
		}
		count := 0
		for _, ev := range state.Evidence {
			if ev.RunID == run.ID {
				var artifact map[string]any
				request("/user/evidence/"+ev.ID, nil, 200, &artifact)
				count++
			}
		}
		if count != scenario.tasks {
			t.Fatalf("%s evidence count: %d", scenario.mode, count)
		}
	}
	var registration struct {
		Worker Worker `json:"worker"`
		Token  string `json:"token"`
	}
	request("/user/workers", map[string]any{"name": "transport-test", "capabilities": []string{"infrastructure.v1"}, "environment": "laboratory"}, 200, &registration)
	workerID = registration.Worker.ID
	request("/worker/1/claim", map[string]any{}, 401, nil)
	token = registration.Token
	request("/worker/2/claim", map[string]any{}, 401, nil)
	var run Run
	request("/user/runs", map[string]any{"mode": "attack", "deduplication_key": "worker", "execution": "external", "policy": DefaultPolicy("laboratory")}, 200, &run)
	var lease struct {
		Task  Task   `json:"task"`
		Lease string `json:"lease"`
	}
	request("/worker/1/claim", map[string]any{}, 200, &lease)
	if lease.Task.ID == "" || lease.Lease == "" {
		t.Fatal("missing task or lease")
	}
	request("/worker/1/tasks/"+lease.Task.ID+"/heartbeat", map[string]any{"lease": lease.Lease, "progress": "transport verified"}, 200, nil)
	result := json.RawMessage(`{"schema_version":"coeli.result.v1","candidate":true}`)
	var evidence Evidence
	request("/worker/1/tasks/"+lease.Task.ID+"/evidence", map[string]any{"lease": lease.Lease, "content": result}, 200, &evidence)
	if evidence.Status != "hypothesis" || evidence.SHA256 != digest(result) {
		t.Fatalf("worker evidence: %+v", evidence)
	}
	var artifact map[string]any
	request("/user/evidence/"+evidence.ID, nil, 200, &artifact)
	completion := map[string]any{"lease": lease.Lease, "outcome": "succeeded", "result": result, "receipt": digest(result)}
	for i := 0; i < 2; i++ {
		request("/worker/1/tasks/"+lease.Task.ID+"/result", completion, 200, nil)
	}
	completion["result"] = json.RawMessage(`{"schema_version":"coeli.result.v1","candidate":false}`)
	request("/worker/1/tasks/"+lease.Task.ID+"/result", completion, 403, nil)
	request("/user/runs", map[string]any{"mode": "attack", "deduplication_key": "cancel", "execution": "external", "policy": DefaultPolicy("laboratory")}, 200, &run)
	request("/worker/1/claim", map[string]any{}, 200, &lease)
	for _, action := range []string{"pause", "resume", "cancel"} {
		request(fmt.Sprintf("/user/runs/%s/control", run.ID), map[string]any{"action": action}, 200, nil)
		status := 409
		if action == "resume" {
			status = 200
		}
		request("/worker/1/tasks/"+lease.Task.ID+"/heartbeat", map[string]any{"lease": lease.Lease}, status, nil)
	}
	request("/user/workers/"+workerID+"/revoke", map[string]any{}, 200, nil)
	request("/worker/1/claim", map[string]any{}, 401, nil)
}
