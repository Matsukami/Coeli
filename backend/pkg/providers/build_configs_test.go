package providers

import (
	"path/filepath"
	"testing"

	"pentagi/pkg/config"
	"pentagi/pkg/providers/provider"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A disabled provider pointed at an unreadable external config must not abort
// startup. Only enabled providers gate construction on their config loading.
func TestBuildDefaultConfigs_DisabledProviderBadPathIsNotFatal(t *testing.T) {
	cfg := &config.Config{
		// External Bedrock config path that doesn't exist; no Bedrock auth set,
		// so the provider is disabled.
		BedrockConfig: filepath.Join(t.TempDir(), "missing.yml"),
	}

	configs, err := buildDefaultConfigs(cfg)

	require.NoError(t, err)
	_, hasBedrock := configs[provider.ProviderBedrock]
	assert.False(t, hasBedrock, "disabled provider with an unreadable config path is skipped")
	_, hasOpenAI := configs[provider.ProviderOpenAI]
	assert.True(t, hasOpenAI, "providers with a readable (embedded) default config still load")
}

// An enabled provider pointed at an unreadable external config must still fail
// loudly — the operator explicitly configured a file that can't be read.
func TestBuildDefaultConfigs_EnabledProviderBadPathIsFatal(t *testing.T) {
	cfg := &config.Config{
		BedrockConfig:      filepath.Join(t.TempDir(), "missing.yml"),
		BedrockBearerToken: "token",
	}

	_, err := buildDefaultConfigs(cfg)

	require.Error(t, err)
}
