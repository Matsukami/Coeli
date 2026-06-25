package providers

import (
	"testing"

	"pentagi/pkg/providers/deepseek"
	"pentagi/pkg/providers/glm"
	"pentagi/pkg/providers/kimi"
	"pentagi/pkg/providers/minimax"
	"pentagi/pkg/providers/pconfig"
	"pentagi/pkg/providers/qwen"
)

func TestOpenAICompatProvidersDoNotUseAdaptiveThinking(t *testing.T) {
	t.Parallel()

	providers := []struct {
		name   string
		config func() (*pconfig.ProviderConfig, error)
		models func() (pconfig.ModelsConfig, error)
	}{
		{"qwen", qwen.DefaultProviderConfig, qwen.DefaultModels},
		{"glm", glm.DefaultProviderConfig, glm.DefaultModels},
		{"deepseek", deepseek.DefaultProviderConfig, deepseek.DefaultModels},
		{"kimi", kimi.DefaultProviderConfig, kimi.DefaultModels},
		{"minimax", minimax.DefaultProviderConfig, minimax.DefaultModels},
	}

	for _, p := range providers {
		cfg, err := p.config()
		if err != nil {
			t.Fatalf("%s: DefaultProviderConfig() error: %v", p.name, err)
		}
		models, err := p.models()
		if err != nil {
			t.Fatalf("%s: DefaultModels() error: %v", p.name, err)
		}

		for _, opt := range pconfig.AllAgentTypes {
			if cfg.UsesAdaptiveThinking(models, opt) {
				t.Errorf("%s/%s resolves to adaptive thinking, but the openaicompat transport never emits it (M7): adaptive thinking is Anthropic/Bedrock-only", p.name, opt)
			}
		}
	}
}
