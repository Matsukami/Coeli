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
// model (from models.yml) forces adaptive thinking via prepareCallOptions even
// when the agent config carries no reasoning block.
func TestBackstopForcesAdaptiveForAdaptiveOnlyModel(t *testing.T) {
	models, err := DefaultModels(&config.Config{})
	require.NoError(t, err)

	pc, err := BuildProviderConfig([]byte("simple:\n  model: us.anthropic.claude-opus-4-8\n  temperature: 1.0\n  n: 1\n  max_tokens: 4000\n"))
	require.NoError(t, err)

	p := &bedrockProvider{providerConfig: pc, models: models}

	assert.Equal(t, pconfig.ModelReasoningAdaptiveOnly, p.modelReasoningMode(pconfig.OptionsTypeSimple))
	assert.True(t, p.usesAdaptiveThinking(pconfig.OptionsTypeSimple),
		"adaptive-only model must force adaptive even without an agent reasoning block")

	ctx, options := p.prepareCallOptions(context.Background(), pconfig.OptionsTypeSimple, nil)
	effort, ok := adaptiveThinkingEffortFromContext(ctx)
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

	p := &bedrockProvider{providerConfig: pc, models: models}

	assert.NotEqual(t, pconfig.ModelReasoningAdaptiveOnly, p.modelReasoningMode(pconfig.OptionsTypeSimple))
	assert.False(t, p.usesAdaptiveThinking(pconfig.OptionsTypeSimple))

	ctx, options := p.prepareCallOptions(context.Background(), pconfig.OptionsTypeSimple, nil)
	_, ok := adaptiveThinkingEffortFromContext(ctx)
	assert.False(t, ok, "no adaptive effort should be set for a non-adaptive model")
	assert.Empty(t, options)
}
