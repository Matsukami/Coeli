package queue_test

import (
	"strconv"
	"testing"
	"time"

	"pentagi/pkg/queue"
)

func TestQueue_StartStop(t *testing.T) {
	input := make(chan int)
	output := make(chan string)
	workers := 4

	q := queue.NewQueue(input, output, workers, func(i int) (string, error) {
		return strconv.Itoa(i), nil
	})

	if running := q.Running(); running {
		t.Errorf("expected queue to be not running, but it is")
	}

	if err := q.Start(); err != nil {
		t.Errorf("failed to start queue: %v", err)
	}

	if running := q.Running(); !running {
		t.Errorf("expected queue to be running, but it is not")
	}

	if err := q.Stop(); err != nil {
		t.Errorf("failed to stop queue: %v", err)
	}

	if running := q.Running(); running {
		t.Errorf("expected queue to be not running, but it is")
	}
}

func TestQueue_CloseInputChannel(t *testing.T) {
	input := make(chan int)
	output := make(chan string)
	workers := 4

	q := queue.NewQueue(input, output, workers, func(i int) (string, error) {
		return strconv.Itoa(i), nil
	})

	if running := q.Running(); running {
		t.Errorf("expected queue to be not running, but it is")
	}

	if err := q.Start(); err != nil {
		t.Errorf("failed to start queue: %v", err)
	}

	if running := q.Running(); !running {
		t.Errorf("expected queue to be running, but it is not")
	}

	close(input)
	time.Sleep(100 * time.Millisecond)

	if running := q.Running(); running {
		t.Errorf("expected queue to be not running, but it is")
	}
}

func TestQueue_Process(t *testing.T) {
	input := make(chan int)
	output := make(chan string)
	workers := 4

	q := queue.NewQueue(input, output, workers, func(i int) (string, error) {
		return strconv.Itoa(i), nil
	})

	if err := q.Start(); err != nil {
		t.Errorf("failed to start queue: %v", err)
	}

	input <- 42
	result := <-output

	expected := "42"
	if result != expected {
		t.Errorf("unexpected result. expected: %s, got: %s", expected, result)
	}

	if err := q.Stop(); err != nil {
		t.Errorf("failed to stop queue: %v", err)
	}
}

func TestQueue_ProcessOrdering(t *testing.T) {
	input := make(chan int)
	output := make(chan int)
	workers := 4

	q := queue.NewQueue(input, output, workers, func(i int) (int, error) {
		return i + 1, nil
	})

	if err := q.Start(); err != nil {
		t.Errorf("failed to start queue: %v", err)
	}

	go func() {
		for i := 0; i < 100000; i++ {
			input <- i
		}

		if err := q.Stop(); err != nil {
			t.Errorf("failed to stop queue: %v", err)
		}

		close(input)
		close(output)
	}()

	var prev int
	for cur := range output {
		if cur != prev+1 {
			t.Errorf("unexpected result. expected: %d, got: %d", prev+1, cur)
		} else {
			prev = cur
		}
	}
}

// Stop() must return when the consumer stops reading output (e.g.
// ListContainerDir bailing on a stat error), leaving workers blocked on the
// send; otherwise wg.Wait() hangs.
func TestQueue_StopDoesNotDeadlockWithUnreadOutput(t *testing.T) {
	input := make(chan int, 20)
	output := make(chan int)
	workers := 4

	q := queue.NewQueue(input, output, workers, func(i int) (int, error) {
		return i, nil
	})
	if err := q.Start(); err != nil {
		t.Fatalf("failed to start queue: %v", err)
	}

	for i := 0; i < 20; i++ {
		input <- i
	}
	close(input)

	<-output // read one, then abandon output with items still in flight

	done := make(chan error, 1)
	go func() { done <- q.Stop() }()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("Stop() deadlocked with unread output")
	}

	if q.Running() {
		t.Error("expected queue to be stopped")
	}
}

// The ListContainerDir happy path: the consumer reads every result after input
// closes. A normal input-close must not make workers drop in-flight results, or
// the consumer waits forever for the last one.
func TestQueue_DeliversEveryResultAfterInputClose(t *testing.T) {
	const n = 200
	input := make(chan int, n)
	output := make(chan int) // unbuffered, like ListContainerDir's outputStats
	for i := 0; i < n; i++ {
		input <- i
	}
	close(input)

	q := queue.NewQueue(input, output, 20, func(i int) (int, error) { return i, nil })
	if err := q.Start(); err != nil {
		t.Fatalf("failed to start queue: %v", err)
	}

	done := make(chan struct{})
	go func() {
		for i := 0; i < n; i++ {
			<-output
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("consumer hung waiting for a result after input close")
	}

	_ = q.Stop()
}

// Small input closes before the consumer bails, so the reader reaches
// input-close (which cancels ctx) first. Stop() must still hard-stop the
// blocked workers instead of short-circuiting as "already stopped".
func TestQueue_StopHardStopsAfterInputClose(t *testing.T) {
	input := make(chan int, 4)
	output := make(chan int)
	for i := 0; i < 4; i++ {
		input <- i
	}
	close(input)

	q := queue.NewQueue(input, output, 4, func(i int) (int, error) { return i, nil })
	if err := q.Start(); err != nil {
		t.Fatalf("failed to start queue: %v", err)
	}

	<-output // read one, abandon the rest
	for q.Running() {
		time.Sleep(time.Millisecond) // wait until the reader processes input-close
	}

	done := make(chan error, 1)
	go func() { done <- q.Stop() }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Stop() short-circuited (%v) instead of hard-stopping blocked workers", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Stop() hung after input close")
	}
}

func BenchmarkQueue_DefaultWorkers(b *testing.B) {
	simpleBenchmark(b, 0)
}

func BenchmarkQueue_EightWorkers(b *testing.B) {
	simpleBenchmark(b, 8)
}

func BenchmarkQueue_FourWorkers(b *testing.B) {
	simpleBenchmark(b, 4)
}

func BenchmarkQueue_ThreeWorkers(b *testing.B) {
	simpleBenchmark(b, 3)
}

func BenchmarkQueue_TwoWorkers(b *testing.B) {
	simpleBenchmark(b, 2)
}

func BenchmarkQueue_OneWorker(b *testing.B) {
	simpleBenchmark(b, 1)
}

func BenchmarkQueue_OriginalSingleGoroutine(b *testing.B) {
	ch := make(chan struct{})
	input := make(chan int, 100)
	output := make(chan string, 100)
	process := func(i int) (string, error) {
		var res string
		for j := i; j < i+1000; j++ {
			res = strconv.Itoa(i)
		}
		return res, nil
	}

	go func() {
		ch <- struct{}{}
		for i := range input {
			res, _ := process(i)
			output <- res
		}
		close(output)
	}()
	<-ch

	b.ResetTimer()

	go func() {
		for i := 0; i < b.N; i++ {
			input <- i
		}
		close(input)
	}()

	for range output {
	}

	b.StopTimer()
}

func simpleBenchmark(b *testing.B, workers int) {
	input := make(chan int, 100)
	output := make(chan string, 100)
	process := func(i int) (string, error) {
		var res string
		for j := i; j < i+1000; j++ {
			res = strconv.Itoa(i)
		}
		return res, nil
	}
	q := queue.NewQueue(input, output, workers, process)

	if err := q.Start(); err != nil {
		b.Fatalf("failed to start queue: %v", err)
	}

	b.ResetTimer()

	go func() {
		for i := 0; i < b.N; i++ {
			input <- i
		}

		if err := q.Stop(); err != nil {
			b.Errorf("failed to stop queue: %v", err)
		}

		close(input)
		close(output)
	}()

	for range output {
	}

	b.StopTimer()
}
