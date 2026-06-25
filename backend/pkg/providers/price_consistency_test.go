package providers

import (
	"testing"

	"pentagi/pkg/providers/deepseek"
	"pentagi/pkg/providers/glm"
	"pentagi/pkg/providers/kimi"
	"pentagi/pkg/providers/minimax"
	"pentagi/pkg/providers/openai"
	"pentagi/pkg/providers/pconfig"
	"pentagi/pkg/providers/qwen"
)

// The default agent config (config.yml) carries its own per-agent price, and
// GetPriceInfoForType returns it verbatim (no catalog fallback), so a drift from
// the model catalog silently mis-prices cost telemetry for the default config.
func TestAgentConfigPricesMatchCatalog(t *testing.T) {
	t.Parallel()

	providers := []struct {
		name   string
		config func() (*pconfig.ProviderConfig, error)
		models func() (pconfig.ModelsConfig, error)
	}{
		{"deepseek", deepseek.DefaultProviderConfig, deepseek.DefaultModels},
		{"glm", glm.DefaultProviderConfig, glm.DefaultModels},
		{"kimi", kimi.DefaultProviderConfig, kimi.DefaultModels},
		{"minimax", minimax.DefaultProviderConfig, minimax.DefaultModels},
		{"openai", openai.DefaultProviderConfig, openai.DefaultModels},
		{"qwen", qwen.DefaultProviderConfig, qwen.DefaultModels},
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

		catalog := make(map[string]*pconfig.PriceInfo, len(models))
		for i := range models {
			catalog[models[i].Name] = models[i].Price
		}

		for _, opt := range pconfig.AllAgentTypes {
			ac := cfg.AgentConfigForType(opt)
			if ac == nil || ac.Model == "" || ac.Price == nil {
				continue
			}
			cat, ok := catalog[ac.Model]
			if !ok || cat == nil {
				continue
			}
			if *ac.Price != *cat {
				t.Errorf("%s/%s model %q: config.yml price %+v != catalog price %+v", p.name, opt, ac.Model, *ac.Price, *cat)
			}
		}
	}
}
