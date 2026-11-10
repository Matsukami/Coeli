package coeli

import (
	"context"
	"errors"
	"testing"
)

func TestOptional_CyberAdapter_FailsClosedWithoutNetwork(t *testing.T) {
	adapter := CyberAdapter{}
	if !errors.Is(adapter.Available(context.Background()), ErrUnavailable) {
		t.Fatal("cyber should be unavailable")
	}
	if result, err := adapter.Generate(context.Background(), ModelRequest{SyntheticInput: "fixture"}); result != nil || !errors.Is(err, ErrUnavailable) {
		t.Fatal("unexpected model call")
	}
}
func TestOptional_ImportAuditCandidate_NeverTrustsConfirmedClaims(t *testing.T) {
	candidate := []byte(`{"schema_version":"coeli.audit.v1","source":"fixture","commit":"abc","coverage":[],"findings":[{"id":"one","status":"confirmed","boundary":"ownership","evidence":["source"]}]}`)
	if _, err := ImportAuditCandidate(candidate); !errors.Is(err, ErrDenied) {
		t.Fatal("unverified claim accepted")
	}
}
