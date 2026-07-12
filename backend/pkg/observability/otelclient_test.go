package observability

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"pentagi/pkg/config"

	collogsv1 "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	colmetricsv1 "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	coltracev1 "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/grpc"
)

type fakeLogsCollector struct {
	collogsv1.UnimplementedLogsServiceServer
}

func (fakeLogsCollector) Export(context.Context, *collogsv1.ExportLogsServiceRequest) (*collogsv1.ExportLogsServiceResponse, error) {
	return &collogsv1.ExportLogsServiceResponse{}, nil
}

type fakeMetricsCollector struct {
	colmetricsv1.UnimplementedMetricsServiceServer
}

func (fakeMetricsCollector) Export(context.Context, *colmetricsv1.ExportMetricsServiceRequest) (*colmetricsv1.ExportMetricsServiceResponse, error) {
	return &colmetricsv1.ExportMetricsServiceResponse{}, nil
}

type fakeTraceCollector struct {
	coltracev1.UnimplementedTraceServiceServer
}

func (fakeTraceCollector) Export(context.Context, *coltracev1.ExportTraceServiceRequest) (*coltracev1.ExportTraceServiceResponse, error) {
	return &coltracev1.ExportTraceServiceResponse{}, nil
}

func TestNewTelemetryClient_EmptyEndpointReturnsErrNotConfigured(t *testing.T) {
	_, err := NewTelemetryClient(context.Background(), &config.Config{TelemetryEndpoint: ""})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}

func TestNewTelemetryClient_SuccessPathExportsAndShutsDown(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	srv := grpc.NewServer()
	collogsv1.RegisterLogsServiceServer(srv, fakeLogsCollector{})
	colmetricsv1.RegisterMetricsServiceServer(srv, fakeMetricsCollector{})
	coltracev1.RegisterTraceServiceServer(srv, fakeTraceCollector{})
	go func() { _ = srv.Serve(ln) }()
	defer srv.Stop()

	client, err := NewTelemetryClient(context.Background(), &config.Config{TelemetryEndpoint: ln.Addr().String()})
	if err != nil {
		t.Fatalf("NewTelemetryClient: %v", err)
	}
	if client.Logger() == nil || client.Tracer() == nil || client.Meter() == nil {
		t.Fatal("a telemetry provider is nil")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.ForceFlush(ctx); err != nil {
		t.Fatalf("ForceFlush: %v", err)
	}
	if err := client.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
}

// A set-but-unreachable collector must not hang startup. The endpoint
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
		t.Fatal("NewTelemetryClient hung past the dial timeout")
	}
}
