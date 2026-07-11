package observability

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"pentagi/pkg/config"
)

func TestNewTelemetryClient_EmptyEndpointReturnsErrNotConfigured(t *testing.T) {
	_, err := NewTelemetryClient(context.Background(), &config.Config{TelemetryEndpoint: ""})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}

// H4 guard: a set-but-unreachable collector must not hang startup. The endpoint
// accepts the TCP connection but never completes the gRPC handshake, so a
// WithBlock dial would wait forever without the internal DefaultDialTimeout that
// this bounds — the caller's context has no deadline.
func TestNewTelemetryClient_UnreachableReturnsWithinDialTimeout(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			// hold the connection open and stay silent (no HTTP/2 handshake)
			defer conn.Close()
		}
	}()

	cfg := &config.Config{TelemetryEndpoint: ln.Addr().String()}
	done := make(chan error, 1)
	go func() {
		_, e := NewTelemetryClient(context.Background(), cfg)
		done <- e
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected an error for an unreachable collector")
		}
	case <-time.After(DefaultDialTimeout + 10*time.Second):
		t.Fatal("NewTelemetryClient hung past the dial timeout (H4 regression)")
	}
}
