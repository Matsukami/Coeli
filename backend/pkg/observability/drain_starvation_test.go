package observability

import (
	"context"
	"net"
	"sync/atomic"
	"testing"
	"time"

	"pentagi/pkg/config"
	"pentagi/pkg/observability/langfuse"

	collogsv1 "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	colmetricsv1 "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	coltracev1 "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/grpc"
)

type recordingTraceCollector struct {
	coltracev1.UnimplementedTraceServiceServer
	spanBatches int32
}

func (r *recordingTraceCollector) Export(context.Context, *coltracev1.ExportTraceServiceRequest) (*coltracev1.ExportTraceServiceResponse, error) {
	atomic.AddInt32(&r.spanBatches, 1)
	return &coltracev1.ExportTraceServiceResponse{}, nil
}

// blockingLangfuse models the real langfuse leg: ForceFlush/Shutdown ignore the
// passed ctx and block on the observer's own machinery, so a pending batch against
// a down endpoint blocks past the drain budget.
type blockingLangfuse struct {
	release    chan struct{}
	flushCalls int32
}

func (b *blockingLangfuse) API() langfuse.Client        { return langfuse.Client{} }
func (b *blockingLangfuse) Observer() langfuse.Observer { return langfuse.NewNoopObserver() }
func (b *blockingLangfuse) ForceFlush(context.Context) error {
	atomic.AddInt32(&b.flushCalls, 1)
	<-b.release
	return nil
}
func (b *blockingLangfuse) Shutdown(context.Context) error {
	<-b.release
	return nil
}

func newRecordingOtel(t *testing.T) (*telemetryClient, *recordingTraceCollector) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	rec := &recordingTraceCollector{}
	srv := grpc.NewServer()
	collogsv1.RegisterLogsServiceServer(srv, fakeLogsCollector{})
	colmetricsv1.RegisterMetricsServiceServer(srv, fakeMetricsCollector{})
	coltracev1.RegisterTraceServiceServer(srv, rec)
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(srv.Stop)

	tc, err := NewTelemetryClient(context.Background(), &config.Config{TelemetryEndpoint: ln.Addr().String()})
	if err != nil {
		t.Fatalf("NewTelemetryClient: %v", err)
	}
	return tc.(*telemetryClient), rec
}

func bufferOneSpan(o *observer) {
	_, span := o.otelclient.Tracer().Tracer("drain-test").Start(context.Background(), "s")
	span.End()
}

// A healthy otel sink is delivered even while an unhealthy langfuse sink blocks.
func TestObserverDrain_DeliversOtelDespiteBlockedLangfuse(t *testing.T) {
	otel, rec := newRecordingOtel(t)
	lf := &blockingLangfuse{release: make(chan struct{})}
	t.Cleanup(func() { close(lf.release) })

	obs := &observer{lfclient: lf, otelclient: otel}
	bufferOneSpan(obs)

	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()
	_ = obs.Drain(ctx)

	if atomic.LoadInt32(&lf.flushCalls) == 0 {
		t.Fatal("precondition: langfuse ForceFlush should have been attempted")
	}
	if got := atomic.LoadInt32(&rec.spanBatches); got != 1 {
		t.Fatalf("otel span must be delivered despite a blocked langfuse; got %d export batches", got)
	}
}

func TestObserverDrain_ReturnsWithinDeadlineWhenSinkBlocks(t *testing.T) {
	otel, _ := newRecordingOtel(t)
	lf := &blockingLangfuse{release: make(chan struct{})}
	t.Cleanup(func() { close(lf.release) })

	obs := &observer{lfclient: lf, otelclient: otel}

	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	err := obs.Drain(ctx)

	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("Drain hung past its deadline: %v", elapsed)
	}
	if err == nil {
		t.Fatal("Drain should report the deadline was hit while a sink was blocked")
	}
}
