package observability

import (
	"context"
	"errors"
	"testing"

	"pentagi/pkg/observability/langfuse"

	otellog "go.opentelemetry.io/otel/log"
	otelloggernoop "go.opentelemetry.io/otel/log/noop"
	otelmetric "go.opentelemetry.io/otel/metric"
	otelmetricnoop "go.opentelemetry.io/otel/metric/noop"
	oteltrace "go.opentelemetry.io/otel/trace"
	oteltracenoop "go.opentelemetry.io/otel/trace/noop"
)

type fakeLangfuseClient struct {
	shutdownCalled bool
	flushCalled    bool
	shutdownErr    error
	flushErr       error
}

func (f *fakeLangfuseClient) API() langfuse.Client        { return langfuse.Client{} }
func (f *fakeLangfuseClient) Observer() langfuse.Observer { return langfuse.NewNoopObserver() }
func (f *fakeLangfuseClient) Shutdown(context.Context) error {
	f.shutdownCalled = true
	return f.shutdownErr
}
func (f *fakeLangfuseClient) ForceFlush(context.Context) error {
	f.flushCalled = true
	return f.flushErr
}

type fakeTelemetryClient struct {
	shutdownCalled bool
	flushCalled    bool
	shutdownErr    error
	flushErr       error
}

func (f *fakeTelemetryClient) Logger() otellog.LoggerProvider {
	return otelloggernoop.NewLoggerProvider()
}
func (f *fakeTelemetryClient) Tracer() oteltrace.TracerProvider {
	return oteltracenoop.NewTracerProvider()
}
func (f *fakeTelemetryClient) Meter() otelmetric.MeterProvider {
	return otelmetricnoop.NewMeterProvider()
}
func (f *fakeTelemetryClient) Shutdown(context.Context) error {
	f.shutdownCalled = true
	return f.shutdownErr
}
func (f *fakeTelemetryClient) ForceFlush(context.Context) error {
	f.flushCalled = true
	return f.flushErr
}

func TestObserverShutdownDrainsBothClients(t *testing.T) {
	lf := &fakeLangfuseClient{}
	ot := &fakeTelemetryClient{}
	obs := &observer{lfclient: lf, otelclient: ot}

	if err := obs.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if !lf.shutdownCalled {
		t.Error("langfuse client was not shut down")
	}
	if !ot.shutdownCalled {
		t.Error("otel client was not shut down")
	}
}

func TestObserverFlushDrainsBothClients(t *testing.T) {
	lf := &fakeLangfuseClient{}
	ot := &fakeTelemetryClient{}
	obs := &observer{lfclient: lf, otelclient: ot}

	if err := obs.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}
	if !lf.flushCalled {
		t.Error("langfuse client was not flushed")
	}
	if !ot.flushCalled {
		t.Error("otel client was not flushed")
	}
}

func TestObserverShutdownAggregatesErrorsAndDrainsBoth(t *testing.T) {
	lfErr := errors.New("langfuse boom")
	otErr := errors.New("otel boom")
	lf := &fakeLangfuseClient{shutdownErr: lfErr}
	ot := &fakeTelemetryClient{shutdownErr: otErr}
	obs := &observer{lfclient: lf, otelclient: ot}

	err := obs.Shutdown(context.Background())
	if !errors.Is(err, lfErr) || !errors.Is(err, otErr) {
		t.Fatalf("want both errors joined, got %v", err)
	}
	if !lf.shutdownCalled || !ot.shutdownCalled {
		t.Fatal("a client was skipped despite the other erroring")
	}
}

func TestObserverShutdownFlushNilClientsAreNoops(t *testing.T) {
	obs := &observer{}
	if err := obs.Shutdown(context.Background()); err != nil {
		t.Errorf("Shutdown with no clients: %v", err)
	}
	if err := obs.Flush(context.Background()); err != nil {
		t.Errorf("Flush with no clients: %v", err)
	}
}
