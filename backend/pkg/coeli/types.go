package coeli

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"slices"
	"time"
)

var ErrDenied = errors.New("scope or permission refused")
var ErrConflict = errors.New("state conflict or expired lease")
var ErrUnavailable = errors.New("integration unavailable")

const ContractVersion = "coeli.worker.v1"

type Policy struct {
	Environment       string `json:"environment"`
	Asset             string `json:"asset"`
	MaxAttempts       int    `json:"max_attempts"`
	MaxConcurrency    int    `json:"max_concurrency"`
	MaxActivities     int    `json:"max_activities"`
	DurationSeconds   int    `json:"duration_seconds"`
	Network           string `json:"network"`
	ProductionEnabled bool   `json:"production_enabled"`
}

func DefaultPolicy(environment string) Policy {
	return Policy{Environment: environment, Asset: "synthetic-records", MaxAttempts: 2, MaxConcurrency: 1, MaxActivities: 30, DurationSeconds: 600, Network: "loopback-only"}
}
func (p Policy) Validate() error {
	if !slices.Contains([]string{"laboratory", "staging"}, p.Environment) || p.Asset != "synthetic-records" || p.Network != "loopback-only" || p.ProductionEnabled || p.MaxAttempts < 1 || p.MaxAttempts > 3 || p.MaxConcurrency != 1 || p.MaxActivities < 1 || p.MaxActivities > 100 || p.DurationSeconds < 10 || p.DurationSeconds > 1800 {
		return ErrDenied
	}
	return nil
}

type Run struct {
	ID         string    `json:"id"`
	Key        string    `json:"deduplication_key"`
	Mode       string    `json:"mode"`
	Status     string    `json:"status"`
	Policy     Policy    `json:"policy"`
	CreatedAt  time.Time `json:"created_at"`
	Deadline   time.Time `json:"deadline"`
	Tasks      []string  `json:"tasks"`
	Activities int       `json:"activities"`
	FlowID     int64     `json:"pentagi_flow_id,omitempty"`
	Version    string    `json:"version"`
}

type Task struct {
	ID         string          `json:"id"`
	RunID      string          `json:"run_id"`
	Capability string          `json:"capability"`
	Stage      string          `json:"stage"`
	Status     string          `json:"status"`
	Execution  string          `json:"execution"`
	WorkerID   string          `json:"worker_id,omitempty"`
	Lease      string          `json:"-"`
	LeaseUntil time.Time       `json:"lease_until"`
	Attempts   int             `json:"attempts"`
	Progress   string          `json:"progress,omitempty"`
	Outcome    string          `json:"outcome,omitempty"`
	Result     json.RawMessage `json:"result,omitempty"`
	Receipt    string          `json:"receipt,omitempty"`
	DependsOn  string          `json:"depends_on,omitempty"`
}

type Worker struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	TokenHash    string    `json:"-"`
	Capabilities []string  `json:"capabilities"`
	Environment  string    `json:"environment"`
	Revoked      bool      `json:"revoked"`
	LastSeen     time.Time `json:"last_seen"`
}

type Evidence struct {
	ID        string    `json:"id"`
	RunID     string    `json:"run_id"`
	TaskID    string    `json:"task_id"`
	SHA256    string    `json:"sha256"`
	Size      int       `json:"size"`
	Kind      string    `json:"kind"`
	Version   string    `json:"version"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	Status    string    `json:"status"`
}

type Incident struct {
	ID         string    `json:"id"`
	RunID      string    `json:"run_id"`
	EventID    string    `json:"event_id"`
	Asset      string    `json:"asset"`
	Rule       string    `json:"rule"`
	Status     string    `json:"status"`
	DetectedAt time.Time `json:"detected_at"`
}

type Telemetry struct {
	ID            string    `json:"id"`
	SchemaVersion string    `json:"schema_version"`
	RunID         string    `json:"run_id"`
	Timestamp     time.Time `json:"timestamp"`
	Source        string    `json:"source"`
	Asset         string    `json:"asset"`
	Kind          string    `json:"kind"`
	Status        int       `json:"status"`
}

type Record struct {
	ID          string          `json:"id"`
	RunID       string          `json:"run_id"`
	Kind        string          `json:"kind"`
	Status      string          `json:"status"`
	EvidenceIDs []string        `json:"evidence_ids"`
	Data        json.RawMessage `json:"data"`
}

type ModelBinding struct {
	Role           string `json:"role"`
	Environment    string `json:"environment"`
	Provider       string `json:"provider"`
	TimeoutSeconds int    `json:"timeout_seconds"`
	MaxCalls       int    `json:"max_calls"`
	Calls          int    `json:"calls"`
	Retries        int    `json:"retries"`
	DataPolicy     string `json:"data_policy"`
	Fallback       string `json:"fallback"`
}

type State struct {
	Version   string                   `json:"schema_version"`
	Emergency bool                     `json:"emergency"`
	Runs      map[string]*Run          `json:"runs"`
	Tasks     map[string]*Task         `json:"tasks"`
	Workers   map[string]*Worker       `json:"workers"`
	Evidence  map[string]*Evidence     `json:"evidence"`
	Incidents map[string]*Incident     `json:"incidents"`
	Records   map[string]*Record       `json:"records"`
	Events    map[string]bool          `json:"events"`
	Models    map[string]*ModelBinding `json:"models"`
}

// Persisted fields use separate wire representations because API responses must not reveal authenticators.
type storedState struct {
	*State
	TaskSecrets   map[string]string `json:"task_secrets"`
	WorkerSecrets map[string]string `json:"worker_secrets"`
}

func encodeState(s *State) ([]byte, error) {
	v := storedState{State: s, TaskSecrets: map[string]string{}, WorkerSecrets: map[string]string{}}
	for id, t := range s.Tasks {
		v.TaskSecrets[id] = t.Lease
	}
	for id, w := range s.Workers {
		v.WorkerSecrets[id] = w.TokenHash
	}
	return json.Marshal(v)
}
func decodeState(b []byte) (*State, error) {
	s := NewState()
	v := storedState{State: s}
	if err := json.Unmarshal(b, &v); err != nil {
		return nil, err
	}
	for id, t := range s.Tasks {
		t.Lease = v.TaskSecrets[id]
	}
	for id, w := range s.Workers {
		w.TokenHash = v.WorkerSecrets[id]
	}
	return s, nil
}
func NewState() *State {
	return &State{Version: ContractVersion, Runs: map[string]*Run{}, Tasks: map[string]*Task{}, Workers: map[string]*Worker{}, Evidence: map[string]*Evidence{}, Incidents: map[string]*Incident{}, Records: map[string]*Record{}, Events: map[string]bool{}, Models: map[string]*ModelBinding{}}
}
func newID() string {
	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func terminal(s string) bool {
	return slices.Contains([]string{"succeeded", "failed", "cancelled", "inconclusive"}, s)
}
func capability(stage string) string {
	switch stage {
	case "audit":
		return "audit.v1"
	case "maintain":
		return "development.v1"
	case "retest", "evaluate", "remember":
		return "verification.v1"
	default:
		return "infrastructure.v1"
	}
}
