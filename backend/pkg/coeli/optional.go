package coeli

import (
	"context"
	"encoding/json"
)

type ModelRequest struct {
	Role           string `json:"role"`
	Environment    string `json:"environment"`
	SyntheticInput string `json:"synthetic_input"`
}
type OptionalModel interface {
	Available(context.Context) error
	Generate(context.Context, ModelRequest) (json.RawMessage, error)
}

type CyberAdapter struct{}

func (CyberAdapter) Available(context.Context) error { return ErrUnavailable }
func (CyberAdapter) Generate(context.Context, ModelRequest) (json.RawMessage, error) {
	return nil, ErrUnavailable
}

type AuditCandidate struct {
	SchemaVersion string          `json:"schema_version"`
	Source        string          `json:"source"`
	Commit        string          `json:"commit"`
	Coverage      json.RawMessage `json:"coverage"`
	Findings      []struct {
		ID       string   `json:"id"`
		Status   string   `json:"status"`
		Boundary string   `json:"boundary"`
		Evidence []string `json:"evidence"`
	} `json:"findings"`
}

func ImportAuditCandidate(b []byte) (*AuditCandidate, error) {
	if len(b) > 64*1024 {
		return nil, ErrDenied
	}
	var candidate AuditCandidate
	if json.Unmarshal(b, &candidate) != nil || candidate.SchemaVersion != "coeli.audit.v1" || candidate.Commit == "" || candidate.Source == "" || !json.Valid(candidate.Coverage) {
		return nil, ErrDenied
	}
	for _, finding := range candidate.Findings {
		if finding.ID == "" || finding.Boundary == "" || len(finding.Evidence) == 0 || finding.Status != "hypothesis" {
			return nil, ErrDenied
		}
	}
	return &candidate, nil
}
