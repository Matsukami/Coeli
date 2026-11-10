package coeli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Executor struct {
	Root    string
	Runtime string
	Node    string
}

func NewExecutor(root, runtime string) (*Executor, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil || root != resolved {
		return nil, ErrDenied
	}
	if _, err := os.Stat(filepath.Join(root, "lab", "runner.mjs")); err != nil {
		return nil, err
	}
	runtime, err = filepath.Abs(runtime)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(runtime, 0700); err != nil {
		return nil, err
	}
	resolved, err = filepath.EvalSymlinks(runtime)
	if err != nil || resolved != runtime {
		return nil, ErrDenied
	}
	node, err := exec.LookPath("node")
	if err != nil {
		return nil, err
	}
	return &Executor{Root: root, Runtime: runtime, Node: node}, nil
}
func (e *Executor) workspace(owner int64, run string) (string, error) {
	if owner <= 0 || len(run) != 48 {
		return "", ErrDenied
	}
	for _, c := range run {
		if !strings.ContainsRune("0123456789abcdef", c) {
			return "", ErrDenied
		}
	}
	dir := filepath.Join(e.Runtime, strconv.FormatInt(owner, 10), run)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(dir)
	if err != nil || real != dir {
		return "", ErrDenied
	}
	return dir, nil
}

type boundedBuffer struct {
	bytes.Buffer
	limit int
}

func (b *boundedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > b.limit {
		return 0, fmt.Errorf("output limit exceeded")
	}
	return b.Buffer.Write(p)
}
func (e *Executor) Execute(ctx context.Context, owner int64, r Run, t Task) (json.RawMessage, error) {
	if err := r.Policy.Validate(); err != nil {
		return nil, err
	}
	if r.FlowID != 0 && t.Stage != "attack" {
		return nil, ErrDenied
	}
	dir, err := e.workspace(owner, r.ID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, e.Node, "--max-old-space-size=128", filepath.Join(e.Root, "lab", "runner.mjs"), dir, t.Stage, r.Mode, r.Policy.Environment)
	cmd.Dir = e.Root
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + dir, "LANG=C.UTF-8", "NODE_OPTIONS="}
	output := &boundedBuffer{limit: 64 * 1024}
	errs := &boundedBuffer{limit: 4096}
	cmd.Stdout = output
	cmd.Stderr = errs
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("lab activity unavailable or failed: %w", err)
	}
	if !json.Valid(output.Bytes()) {
		return nil, fmt.Errorf("invalid activity output")
	}
	return append(json.RawMessage(nil), output.Bytes()...), nil
}
func (e *Executor) PutArtifact(owner int64, run string, content []byte) (string, error) {
	if len(content) == 0 || len(content) > 64*1024 || !json.Valid(content) {
		return "", ErrDenied
	}
	dir, err := e.workspace(owner, run)
	if err != nil {
		return "", err
	}
	sha := digest(content)
	name := filepath.Join(dir, sha+".json")
	f, err := os.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if os.IsExist(err) {
		old, readErr := os.ReadFile(name)
		if readErr != nil || digest(old) != sha {
			return "", ErrConflict
		}
		return sha, nil
	}
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err = f.Write(content); err != nil {
		return "", err
	}
	if err = f.Sync(); err != nil {
		return "", err
	}
	return sha, nil
}
func (e *Executor) Artifact(owner int64, ev Evidence) ([]byte, error) {
	if len(ev.SHA256) != 64 || time.Now().After(ev.ExpiresAt) {
		return nil, ErrDenied
	}
	dir, err := e.workspace(owner, ev.RunID)
	if err != nil {
		return nil, err
	}
	name := filepath.Join(dir, ev.SHA256+".json")
	info, err := os.Lstat(name)
	if err != nil || !info.Mode().IsRegular() {
		return nil, ErrDenied
	}
	f, err := os.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, 64*1024+1))
	if err != nil || len(b) > 64*1024 || digest(b) != ev.SHA256 {
		return nil, ErrConflict
	}
	return b, nil
}
