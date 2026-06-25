package pconfig

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vxcontrol/langchaingo/llms"
	"gopkg.in/yaml.v3"
)

func TestReasoningConfig_GetEffortPreservesXHighAndMax(t *testing.T) {
	for _, effort := range []llms.ReasoningEffort{llms.ReasoningXHigh, llms.ReasoningMax} {
		rc := llms.ReasoningConfig{Effort: effort}
		if got := rc.GetEffort(8192); got != effort {
			t.Errorf("GetEffort(effort=%q) = %q, want %q: the xhigh/max clamp must stay removed so OpenAI-compatible reasoning_effort carries the real level", effort, got, effort)
		}
	}
}

func TestProviderConfig_EmitsTopReasoningEffortOnEffortPath(t *testing.T) {
	for _, effort := range []string{"low", "medium", "high", "xhigh", "max"} {
		t.Run(effort, func(t *testing.T) {
			var ac AgentConfig
			require.NoError(t, yaml.Unmarshal([]byte("model: gpt-5.5\nreasoning:\n  effort: "+effort+"\n"), &ac))

			pc := &ProviderConfig{Simple: &ac}
			var applied llms.CallOptions
			for _, opt := range pc.GetOptionsForType(OptionsTypeSimple) {
				opt(&applied)
			}

			require.NotNil(t, applied.Reasoning, "effort %q must emit a reasoning option on the non-adaptive path", effort)
			assert.Equal(t, llms.ReasoningEffort(effort), applied.Reasoning.Effort, "the configured effort must reach the call options unchanged")
		})
	}
}
