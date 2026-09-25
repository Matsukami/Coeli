package models

import (
	"errors"
	"strings"
	"testing"

	"github.com/go-playground/validator/v10"
	"github.com/stretchr/testify/assert"
)

// modelsJWT is three dot-separated base64 segments, the shape the jwt tag accepts.
const modelsJWT = "synthetic.fixture.00000000000000000000000000000013"

// modelsRefusal names what Valid refused: "Namespace:tag" per failed field, the text of any other error.
func modelsRefusal(err error) string {
	if err == nil {
		return ""
	}

	var failures validator.ValidationErrors
	if !errors.As(err, &failures) {
		return err.Error()
	}

	refused := make([]string, 0, len(failures))
	for _, failure := range failures {
		refused = append(refused, failure.Namespace()+":"+failure.Tag())
	}

	return strings.Join(refused, " ")
}

// modelsValidCase is one row of a Valid table; refuses is empty for a model Valid must accept.
type modelsValidCase struct {
	name    string
	model   IValid
	refuses string
}

func modelsCheckValid(t *testing.T, cases []modelsValidCase) {
	t.Helper()

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tc.refuses, modelsRefusal(tc.model.Valid()))
		})
	}
}

// modelsWith returns base after one change, so a row states only what makes it invalid.
func modelsWith[T any](base T, change func(*T)) T {
	change(&base)

	return base
}

type modelsTabled interface {
	TableName() string
}

func modelsFlow() Flow {
	traceID := "trace-123"

	return Flow{
		Status:             FlowStatusCreated,
		Title:              "test flow",
		Model:              "gpt-4",
		ModelProviderName:  "openai",
		ModelProviderType:  ProviderType("openai"),
		Language:           "en",
		ToolCallIDTemplate: "call_{id}",
		TraceID:            &traceID,
		UserID:             1,
	}
}

func modelsTask() Task {
	return Task{Status: TaskStatusCreated, Title: "test task", Input: "test input", FlowID: 1}
}

func modelsSubtask() Subtask {
	return Subtask{Status: SubtaskStatusCreated, Title: "subtask1", Description: "description1", TaskID: 1}
}

func modelsContainer() Container {
	return Container{
		Type:     ContainerTypePrimary,
		Name:     "test-container",
		Image:    "alpine:latest",
		Status:   ContainerStatusRunning,
		LocalID:  "abc123",
		LocalDir: "/tmp/test",
		FlowID:   1,
	}
}
