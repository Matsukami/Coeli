package anthropic

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"pentagi/pkg/config"
	"pentagi/pkg/providers/pconfig"
	"pentagi/pkg/providers/provider"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRewriteAdaptiveThinkingBody(t *testing.T) {
	body := []byte(`{
		"model": "claude-opus-4-8",
		"max_tokens": 16000,
		"temperature": 1.0,
		"top_p": 0.95,
		"thinking": {"type": "enabled", "budget_tokens": 4096},
		"messages": []
	}`)

	updatedBody, err := rewriteAdaptiveThinkingBody(body, "xhigh")
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(updatedBody, &payload))

	thinking := payload["thinking"].(map[string]any)
	assert.Equal(t, "adaptive", thinking["type"])
	assert.Equal(t, "summarized", thinking["display"])
	assert.NotContains(t, thinking, "budget_tokens")

	outputConfig := payload["output_config"].(map[string]any)
	assert.Equal(t, "xhigh", outputConfig["effort"])

	// Opus 4.7+ reject sampling params (top-level in the Anthropic Messages API).
	assert.NotContains(t, payload, "temperature")
	assert.NotContains(t, payload, "top_p")
	assert.NotContains(t, payload, "top_k")
}

func TestRewriteAdaptiveThinkingBodyWithoutThinking(t *testing.T) {
	body := []byte(`{"model":"claude-opus-4-6","max_tokens":1024}`)

	updatedBody, err := rewriteAdaptiveThinkingBody(body, "high")
	require.NoError(t, err)
	assert.JSONEq(t, string(body), string(updatedBody))
}

// TestAdaptiveThinkingRoundTrip verifies the full local chain (adaptive-only model
// -> prepareCallOptions -> ctx -> langchaingo -> RoundTripper rewrite) by capturing
// the request that actually hits the wire, without needing a real API call.
func TestAdaptiveThinkingRoundTrip(t *testing.T) {
	var (
		mu       sync.Mutex
		captured []byte
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		captured = body
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-4-8","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	defer server.Close()

	// simple -> claude-opus-4-8 (adaptive-only in models.yml) with temperature set,
	// so the backstop must force adaptive and the rewrite must strip temperature.
	providerConfig, err := BuildProviderConfig([]byte("simple:\n  model: claude-opus-4-8\n  temperature: 1.0\n  n: 1\n  max_tokens: 1000\n"))
	require.NoError(t, err)

	cfg := &config.Config{AnthropicAPIKey: "test-key", AnthropicServerURL: server.URL}
	prov, err := New(cfg, provider.DefaultProviderNameAnthropic, providerConfig)
	require.NoError(t, err)

	// The response is a stub; we only assert on the captured request body.
	_, _ = prov.Call(context.Background(), pconfig.OptionsTypeSimple, "hi")

	mu.Lock()
	body := captured
	mu.Unlock()
	require.NotEmpty(t, body, "no request reached the server")

	var payload map[string]any
	require.NoError(t, json.Unmarshal(body, &payload))

	thinking, ok := payload["thinking"].(map[string]any)
	require.True(t, ok, "request must carry a thinking block")
	assert.Equal(t, "adaptive", thinking["type"])
	assert.Equal(t, "summarized", thinking["display"])
	assert.NotContains(t, payload, "temperature", "sampling params must be stripped for adaptive models")
	if oc, ok := payload["output_config"].(map[string]any); ok {
		assert.Equal(t, "high", oc["effort"])
	} else {
		t.Error("request must carry output_config.effort")
	}
}
