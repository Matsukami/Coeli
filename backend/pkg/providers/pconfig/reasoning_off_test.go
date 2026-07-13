package pconfig

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vxcontrol/langchaingo/llms"
	"gopkg.in/yaml.v3"
)

// An explicit off mode must emit llms.WithReasoningDisabled() so the langchaingo
// adapter sends the provider's disable wire.
func TestProviderConfig_EmitsDisableOnOffMode(t *testing.T) {
	var ac AgentConfig
	require.NoError(t, yaml.Unmarshal([]byte("model: gpt-5.5\nreasoning:\n  mode: \"off\"\n"), &ac))

	require.Equal(t, ReasoningModeOff, ac.Reasoning.Mode)
	require.False(t, ac.Reasoning.IsZero(), "off must be non-zero so BuildOptions emits it")
	require.Equal(t, ReasoningModeOff, ac.Reasoning.EffectiveMode())

	pc := &ProviderConfig{Simple: &ac}
	var applied llms.CallOptions
	for _, opt := range pc.GetOptionsForType(OptionsTypeSimple) {
		opt(&applied)
	}

	require.NotNil(t, applied.Reasoning, "off must emit a reasoning option")
	assert.True(t, applied.Reasoning.IsDisabled(), "off must disable reasoning on the call options")
}

// gopkg.in/yaml.v3 follows YAML 1.2 core (only true/false are booleans), so an
// unquoted off in a user-authored provider YAML parses as the string mode, not a
// boolean. This guards the user-editable config path against the YAML 1.1 off gotcha.
func TestReasoningConfig_UnquotedOffParsesAsMode(t *testing.T) {
	var ac AgentConfig
	require.NoError(t, yaml.Unmarshal([]byte("model: gpt-5.5\nreasoning:\n  mode: off\n"), &ac))
	assert.Equal(t, ReasoningModeOff, ac.Reasoning.Mode)
}
