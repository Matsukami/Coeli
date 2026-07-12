package services

import (
	"fmt"
	"net/http"
	"os"
	"testing"

	"pentagi/pkg/docker"
	"pentagi/pkg/server/models"
	"pentagi/pkg/version"

	"github.com/docker/docker/api/types/container"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func containsFilePath(files []models.ContainerFile, p string) bool {
	for _, f := range files {
		if f.Path == p {
			return true
		}
	}
	return false
}

func containsFailurePath(failures []models.ContainerFileError, p string) bool {
	for _, f := range failures {
		if f.Path == p {
			return true
		}
	}
	return false
}

func listContainerFiles(t *testing.T, fake *fakeDockerClient, query string) (*int, models.ContainerFiles) {
	t.Helper()
	db := setupFlowFileServiceTestDB(t)
	seedFlow(t, db, 1, 1)
	svc := NewFlowFileService(db, t.TempDir(), fake, nil)
	c, w := newFlowFileTestContext(http.MethodGet, "/flows/1/files/container?"+query, nil,
		[]string{"flow_files.view", "containers.view"}, 1, 1)
	svc.GetFlowContainerFiles(c)
	return &w.Code, decodeContainerFilesResponse(t, w)
}

// The client body must not carry docker-layer error detail (container ids, the
// daemon address) outside develop mode — the same dev-gate response.Error applies.
func TestGetFlowContainerFiles_FailureMessageIsDevGated(t *testing.T) {
	rawErr := "Error response from daemon: container 9f8e7d6c5b4a on tcp://10.0.0.5:2376 lstat failed"
	newFake := func() *fakeDockerClient {
		f := &fakeDockerClient{running: true}
		f.statPathMap = map[string]container.PathStat{"/work": {Mode: os.ModeDir | 0755}}
		f.listDirMap = map[string][]container.PathStat{"/work": {{Name: "readme", Mode: 0644, Size: 1}}}
		f.listDirFailMap = map[string][]docker.ContainerEntryError{
			"/work": {{Name: "secret", Path: "/work/secret", Err: fmt.Errorf("%s", rawErr)}},
		}
		return f
	}

	t.Run("production hides the raw error", func(t *testing.T) {
		version.PackageVer = "1.0.0"
		t.Cleanup(func() { version.PackageVer = "" })
		code, resp := listContainerFiles(t, newFake(), "paths[]=/work")
		require.Equal(t, http.StatusOK, *code)
		require.Len(t, resp.Failures, 1)
		assert.NotContains(t, resp.Failures[0].Message, "tcp://10.0.0.5:2376")
		assert.NotContains(t, resp.Failures[0].Message, "9f8e7d6c5b4a")
		assert.Equal(t, "entry could not be read", resp.Failures[0].Message)
	})

	t.Run("develop mode still exposes it for debugging", func(t *testing.T) {
		version.PackageVer = "" // develop mode
		code, resp := listContainerFiles(t, newFake(), "paths[]=/work")
		require.Equal(t, http.StatusOK, *code)
		require.Len(t, resp.Failures, 1)
		assert.Contains(t, resp.Failures[0].Message, "tcp://10.0.0.5:2376")
	})
}

// A path read successfully by any query must never also appear in Failures,
// regardless of the order the paths were processed.
func TestGetFlowContainerFiles_PathNeverInBothArrays(t *testing.T) {
	newFake := func() *fakeDockerClient {
		f := &fakeDockerClient{running: true}
		f.statPathMap = map[string]container.PathStat{
			"/work":   {Mode: os.ModeDir | 0755},
			"/work/x": {Name: "x", Mode: 0644, Size: 1},
		}
		f.listDirMap = map[string][]container.PathStat{"/work": {}}
		f.listDirFailMap = map[string][]docker.ContainerEntryError{
			"/work": {{Name: "x", Path: "/work/x", Err: fmt.Errorf("stat: no such file")}},
		}
		return f
	}

	for _, order := range []string{"paths[]=/work&paths[]=/work/x", "paths[]=/work/x&paths[]=/work"} {
		code, resp := listContainerFiles(t, newFake(), order)
		require.Equal(t, http.StatusOK, *code)
		assert.True(t, containsFilePath(resp.Files, "/work/x"), "order %q: /work/x should be in Files", order)
		assert.False(t, containsFailurePath(resp.Failures, "/work/x"),
			"order %q: /work/x must NOT also be in Failures", order)
	}
}
