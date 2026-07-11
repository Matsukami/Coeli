package queue_test

import (
	"errors"
	"fmt"
	"math/rand"
	"runtime"
	"testing"
	"time"

	"pentagi/pkg/queue"
)

// Inputs are 0..n-1 and process returns the value unchanged, so a correct queue
// delivers the contiguous, in-order prefix 0,1,2,... A dropped or out-of-order
// result shows up immediately as a wrong value or a hang.
func newIntQueue(input chan int, output chan int, workers int) queue.Queue {
	return queue.NewQueue(input, output, workers, func(i int) (int, error) { return i, nil })
}

// readPrefix reads want results, asserting each equals its index (contiguous
// in-order prefix from 0). Fails the test on a wrong value or a timeout.
func readPrefix(t *testing.T, output <-chan int, want int, timeout time.Duration) {
	t.Helper()
	done := make(chan error, 1)
	go func() {
		for i := 0; i < want; i++ {
			v, ok := <-output
			if !ok {
				done <- fmt.Errorf("output closed after %d/%d results", i, want)
				return
			}
			if v != i {
				done <- fmt.Errorf("gap/out-of-order at %d: got %d", i, v)
				return
			}
		}
		done <- nil
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(timeout):
		t.Fatalf("hung waiting for %d results (in-flight result dropped?)", want)
	}
}

func mustStopWithin(t *testing.T, q queue.Queue, d time.Duration) {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- q.Stop() }()
	select {
	case err := <-done:
		if err != nil && !errors.Is(err, queue.ErrAlreadyStopped) {
			t.Fatalf("Stop returned %v", err)
		}
	case <-time.After(d):
		t.Fatal("Stop() hung")
	}
}

// The exact class of the shipped CON-1 regression: a normal input-close must
// deliver EVERY queued result across the whole N range, including the buffer
// boundary where the reader blocks on q.queue while workers drain.
func TestQueue_DeliversAllAtBoundaries(t *testing.T) {
	const workers = 8
	for _, n := range []int{1, workers - 1, workers, workers * 2, workers*2 + 1, 500} {
		t.Run(fmt.Sprintf("n=%d", n), func(t *testing.T) {
			input := make(chan int, n)
			output := make(chan int)
			for i := 0; i < n; i++ {
				input <- i
			}
			close(input)

			q := newIntQueue(input, output, workers)
			if err := q.Start(); err != nil {
				t.Fatalf("start: %v", err)
			}
			readPrefix(t, output, n, 5*time.Second)
			mustStopWithin(t, q, 3*time.Second)
		})
	}
}

// Consumer abandons output after reading a prefix (ListContainerDir's error
// path). What it read must be a contiguous in-order prefix, and Stop() must
// return without hanging — for both small (reader reached input-close) and large
// (reader blocked on q.queue) N.
func TestQueue_ContiguousPrefixThenStopOnAbandon(t *testing.T) {
	const workers = 4 // buffer = 8
	cases := []struct{ n, read int }{
		{n: 4, read: 1},   // small: reader reaches input-close first
		{n: 4, read: 0},   // small: abandon immediately
		{n: 4, read: 4},   // small: read all
		{n: 200, read: 1}, // large: reader blocked on full q.queue
		{n: 200, read: 50},
		{n: 200, read: 200},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("n=%d_read=%d", c.n, c.read), func(t *testing.T) {
			input := make(chan int, c.n)
			output := make(chan int)
			for i := 0; i < c.n; i++ {
				input <- i
			}
			close(input)

			q := newIntQueue(input, output, workers)
			if err := q.Start(); err != nil {
				t.Fatalf("start: %v", err)
			}
			readPrefix(t, output, c.read, 5*time.Second)
			mustStopWithin(t, q, 3*time.Second)
		})
	}
}

// Property-based: over many randomized shapes, the delivered results are always
// a contiguous in-order prefix of the input and Stop() always returns. Fixed
// seed keeps it deterministic.
func TestQueue_PrefixInvariantFuzz(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for iter := 0; iter < 300; iter++ {
		n := 1 + rng.Intn(200)
		workers := 1 + rng.Intn(20)
		read := rng.Intn(n + 1) // 0..n
		input := make(chan int, n)
		output := make(chan int)
		for i := 0; i < n; i++ {
			input <- i
		}
		close(input)

		q := newIntQueue(input, output, workers)
		if err := q.Start(); err != nil {
			t.Fatalf("iter %d start: %v", iter, err)
		}
		readPrefix(t, output, read, 5*time.Second)
		mustStopWithin(t, q, 3*time.Second)
	}
}

// After Stop() returns, no queue goroutines are left running.
func TestQueue_NoGoroutineLeakOnAbandon(t *testing.T) {
	base := runtime.NumGoroutine()
	for i := 0; i < 20; i++ {
		input := make(chan int, 50)
		output := make(chan int)
		for j := 0; j < 50; j++ {
			input <- j
		}
		close(input)
		q := newIntQueue(input, output, 8)
		if err := q.Start(); err != nil {
			t.Fatalf("start: %v", err)
		}
		<-output // read one, abandon the rest
		mustStopWithin(t, q, 3*time.Second)
	}
	// allow scheduler to reap exited goroutines
	for i := 0; i < 100; i++ {
		if runtime.NumGoroutine() <= base+2 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("goroutine leak: baseline %d, now %d", base, runtime.NumGoroutine())
}

// Restarting without an intervening Stop() (a contract violation) must be
// rejected, not silently corrupt the shared wg / stopCtx.
func TestQueue_RestartWithoutStopRejected(t *testing.T) {
	input := make(chan int, 3)
	output := make(chan int)
	q := newIntQueue(input, output, 1)
	if err := q.Start(); err != nil {
		t.Fatalf("start1: %v", err)
	}
	for i := 0; i < 3; i++ {
		input <- i
	}
	close(input)
	<-output
	for q.Running() {
		time.Sleep(time.Millisecond) // reader processes input-close
	}
	if err := q.Start(); !errors.Is(err, queue.ErrAlreadyRunning) {
		t.Fatalf("restart without Stop: want ErrAlreadyRunning, got %v", err)
	}
	mustStopWithin(t, q, 3*time.Second)
}

func TestQueue_RestartAfterStopReuse(t *testing.T) {
	input := make(chan int)
	output := make(chan int)
	q := newIntQueue(input, output, 4)
	for cycle := 0; cycle < 3; cycle++ {
		if err := q.Start(); err != nil {
			t.Fatalf("cycle %d start: %v", cycle, err)
		}
		if !q.Running() {
			t.Fatalf("cycle %d: expected running", cycle)
		}
		if err := q.Stop(); err != nil {
			t.Fatalf("cycle %d stop: %v", cycle, err)
		}
		if q.Running() {
			t.Fatalf("cycle %d: expected stopped", cycle)
		}
	}
}

// A non-nil Go error from process() must not stall the ordering chain: the
// worker logs it and moves on (this error path yields no output for that item,
// which is why ListContainerDir carries its errors inside the result value).
func TestQueue_ProcessGoErrorAdvancesChain(t *testing.T) {
	input := make(chan int, 3)
	output := make(chan string)
	for i := 0; i < 3; i++ {
		input <- i
	}
	close(input)

	q := queue.NewQueue(input, output, 2, func(i int) (string, error) {
		if i == 1 {
			return "", errors.New("boom")
		}
		return fmt.Sprintf("ok-%d", i), nil
	})
	if err := q.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}

	got := make(chan []string, 1)
	go func() {
		var out []string
		for len(out) < 2 { // items 0 and 2 produce output; item 1 errors
			out = append(out, <-output)
		}
		got <- out
	}()
	select {
	case out := <-got:
		if len(out) != 2 {
			t.Fatalf("got %v", out)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("hung: Go-error branch stalled the chain")
	}
	mustStopWithin(t, q, 3*time.Second)
}

func TestQueue_DoubleStop(t *testing.T) {
	input := make(chan int)
	output := make(chan int)
	q := newIntQueue(input, output, 2)
	if err := q.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	if err := q.Stop(); err != nil {
		t.Fatalf("stop1: %v", err)
	}
	if err := q.Stop(); !errors.Is(err, queue.ErrAlreadyStopped) {
		t.Fatalf("stop2: want ErrAlreadyStopped, got %v", err)
	}
}

func TestQueue_RunningTransitions(t *testing.T) {
	input := make(chan int, 2)
	output := make(chan int)
	q := newIntQueue(input, output, 2)
	if q.Running() {
		t.Fatal("before Start: want not running")
	}
	if err := q.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	if !q.Running() {
		t.Fatal("after Start: want running")
	}
	input <- 0
	input <- 1
	close(input)
	<-output
	<-output
	for i := 0; i < 200 && q.Running(); i++ {
		time.Sleep(time.Millisecond)
	}
	if q.Running() {
		t.Fatal("after input-close: want not running")
	}
	if err := q.Stop(); err != nil {
		t.Fatalf("stop: %v", err)
	}
	if q.Running() {
		t.Fatal("after Stop: want not running")
	}
}
