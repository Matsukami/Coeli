package providers

import (
	"path/filepath"
	"testing"

	"pentagi/pkg/config"
	"pentagi/pkg/providers/provider"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildDefaultConfigs_DisabledProviderBadPathIsNotFatal(t *testing.T) {
	cfg := &config.Config{
		BedrockConfig: filepath.Join(t.TempDir(), "missing.yml"),
	}

	configs, err := buildDefaultConfigs(cfg)

	require.NoError(t, err)
	_, hasBedrock := configs[provider.ProviderBedrock]
	assert.False(t, hasBedrock, "disabled provider with an unreadable config path is skipped")
	_, hasOpenAI := configs[provider.ProviderOpenAI]
	assert.True(t, hasOpenAI, "providers with a readable (embedded) default config still load")
}

func TestBuildDefaultConfigs_EnabledProviderBadPathIsFatal(t *testing.T) {
	cfg := &config.Config{
		BedrockConfig:      filepath.Join(t.TempDir(), "missing.yml"),
		BedrockBearerToken: "token",
	}

	_, err := buildDefaultConfigs(cfg)

	require.Error(t, err)
}
