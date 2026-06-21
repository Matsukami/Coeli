package bedrock

import (
	"context"
	"encoding/json"
	"testing"

	"pentagi/pkg/config"
	"pentagi/pkg/providers/pconfig"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vxcontrol/langchaingo/llms"
)

func TestRewriteAdaptiveThinkingBody(t *testing.T) {
	body := []byte(`{
		"additionalModelRequestFields": {
			"thinking": {
				"type": "enabled",
				"budget_tokens": 4096
			}
		},
		"inferenceConfig": {
			"maxTokens": 16384
		}
	}`)

	updatedBody, err := rewriteAdaptiveThinkingBody(body, "xhigh")
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(updatedBody, &payload))

	fields := payload["additionalModelRequestFields"].(map[string]any)
	thinking := fields["thinking"].(map[string]any)
	outputConfig := fields["output_config"].(map[string]any)

	assert.Equal(t, "adaptive", thinking["type"])
	assert.NotContains(t, thinking, "budget_tokens")
	assert.Equal(t, "xhigh", outputConfig["effort"])
	assert.Equal(t, map[string]any{"maxTokens": float64(16384)}, payload["inferenceConfig"])
}

func TestRewriteAdaptiveThinkingBodyWithoutThinking(t *testing.T) {
	body := []byte(`{"inferenceConfig":{"maxTokens":1024}}`)

	updatedBody, err := rewriteAdaptiveThinkingBody(body, "high")
	require.NoError(t, err)
	assert.JSONEq(t, string(body), string(updatedBody))
}

func TestRewriteAdaptiveThinkingBodyStripsSamplingAndSetsDisplay(t *testing.T) {
	body := []byte(`{
		"additionalModelRequestFields": {
			"thinking": {"type": "enabled", "budget_tokens": 4096}
		},
		"inferenceConfig": {
			"maxTokens": 16384,
			"temperature": 1.0,
			"topP": 0.95
		}
	}`)

	updatedBody, err := rewriteAdaptiveThinkingBody(body, "high")
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(updatedBody, &payload))

	thinking := payload["additionalModelRequestFields"].(map[string]any)["thinking"].(map[string]any)
	assert.Equal(t, "adaptive", thinking["type"])
	assert.Equal(t, "summarized", thinking["display"])

	// Opus 4.7+ reject sampling params; only maxTokens must survive in inferenceConfig.
	assert.Equal(t, map[string]any{"maxTokens": float64(16384)}, payload["inferenceConfig"])
}

// TestBackstopForcesAdaptiveForAdaptiveOnlyModel verifies that an adaptive-only
// model (from models.yml) forces adaptive thinking via PrepareAdaptiveCallOptions
// even when the agent config carries no reasoning block.
func TestBackstopForcesAdaptiveForAdaptiveOnlyModel(t *testing.T) {
	models, err := DefaultModels(&config.Config{})
	require.NoError(t, err)

	pc, err := BuildProviderConfig([]byte("simple:\n  model: us.anthropic.claude-opus-4-8\n  temperature: 1.0\n  n: 1\n  max_tokens: 4000\n"))
	require.NoError(t, err)

	assert.True(t, pc.UsesAdaptiveThinking(models, pconfig.OptionsTypeSimple),
		"adaptive-only model must force adaptive even without an agent reasoning block")

	ctx, options := pc.PrepareAdaptiveCallOptions(context.Background(), models, pconfig.OptionsTypeSimple, nil)
	effort, ok := pconfig.AdaptiveEffortFromContext(ctx)
	assert.True(t, ok, "effort must be installed in context for the middleware")
	assert.Equal(t, string(llms.ReasoningHigh), effort)
	assert.NotEmpty(t, options, "WithReasoning must be appended so langchaingo emits a thinking block")
}

func TestBackstopLeavesNonReasoningModelUntouched(t *testing.T) {
	models, err := DefaultModels(&config.Config{})
	require.NoError(t, err)

	// gpt-oss has no adaptive-only descriptor; with no agent reasoning block it must not force adaptive.
	pc, err := BuildProviderConfig([]byte("simple:\n  model: openai.gpt-oss-120b-1:0\n  temperature: 0.5\n  n: 1\n  max_tokens: 4000\n"))
	require.NoError(t, err)

	assert.False(t, pc.UsesAdaptiveThinking(models, pconfig.OptionsTypeSimple))

	ctx, options := pc.PrepareAdaptiveCallOptions(context.Background(), models, pconfig.OptionsTypeSimple, nil)
	_, ok := pconfig.AdaptiveEffortFromContext(ctx)
	assert.False(t, ok, "no adaptive effort should be set for a non-adaptive model")
	assert.Empty(t, options)
}
