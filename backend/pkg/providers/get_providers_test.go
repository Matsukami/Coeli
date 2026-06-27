package providers

import (
	"context"
	"testing"

	"pentagi/pkg/config"
	"pentagi/pkg/database"
	"pentagi/pkg/providers/provider"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubTypedProvider reports only its type — enough for Providers.ListTypes(),
// which is all GetProviders touches before it rejects an unavailable type.
type stubTypedProvider struct {
	provider.Provider
	ptype provider.ProviderType
}

func (s stubTypedProvider) Type() provider.ProviderType { return s.ptype }

type stubProvidersQuerier struct {
	database.Querier
	rows []database.Provider
}

func (s stubProvidersQuerier) GetUserProviders(context.Context, int64) ([]database.Provider, error) {
	return s.rows, nil
}

func TestGetProviders_SkipsUserProviderOfDisabledType(t *testing.T) {
	pc := &providerController{
		cfg: &config.Config{},
		db: stubProvidersQuerier{rows: []database.Provider{
			{Name: "stale-minimax", Type: "minimax"}, // not in ListTypes() below
		}},
		Providers: provider.Providers{
			"openai-default": stubTypedProvider{ptype: provider.ProviderOpenAI},
		},
	}

	got, err := pc.GetProviders(context.Background(), 1)

	require.NoError(t, err, "one user provider of a disabled type must not fail the whole query")
	assert.Contains(t, got, provider.ProviderName("openai-default"), "enabled providers stay reachable")
	assert.NotContains(t, got, provider.ProviderName("stale-minimax"), "the unavailable provider is skipped")
}

func TestGetProviders_StaleUserRowSpansValidSibling(t *testing.T) {
	pc := &providerController{
		cfg: &config.Config{},
		db: stubProvidersQuerier{rows: []database.Provider{
			// ollama.New builds with no API key and makes no network call (pull/load
			// off under the empty config), so this row clears the real NewProvider.
			{Name: "ollama-user", Type: "ollama"},
			{Name: "stale-minimax", Type: "minimax"}, // type absent from ListTypes()
		}},
		Providers: provider.Providers{
			"ollama-default": stubTypedProvider{ptype: provider.ProviderOllama},
		},
	}

	got, err := pc.GetProviders(context.Background(), 1)

	require.NoError(t, err, "a stale sibling row must not fail the whole query")
	assert.Contains(t, got, provider.ProviderName("ollama-user"), "a valid user provider survives a stale sibling")
	assert.NotContains(t, got, provider.ProviderName("stale-minimax"), "the unbuildable sibling is skipped")
}
