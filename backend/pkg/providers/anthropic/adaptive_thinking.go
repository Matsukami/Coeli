package anthropic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"pentagi/pkg/providers/pconfig"
)

// adaptiveThinkingTransport rewrites the outgoing Anthropic Messages request body
// to use adaptive thinking when the call context carries an effort (set by
// pconfig.PrepareAdaptiveCallOptions). langchaingo only emits budget thinking, but
// Claude Opus 4.7/4.8 only support thinking.type=adaptive and reject sampling params.
type adaptiveThinkingTransport struct {
	base http.RoundTripper
}

func (t *adaptiveThinkingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	effort, ok := pconfig.AdaptiveEffortFromContext(req.Context())
	if !ok || req.Body == nil {
		return t.base.RoundTrip(req)
	}

	body, err := io.ReadAll(req.Body)
	_ = req.Body.Close()
	if err != nil {
		return nil, fmt.Errorf("read Anthropic request body: %w", err)
	}

	updatedBody, err := rewriteAdaptiveThinkingBody(body, effort)
	if err != nil {
		return nil, err
	}

	clone := req.Clone(req.Context())
	clone.Body = io.NopCloser(bytes.NewReader(updatedBody))
	clone.ContentLength = int64(len(updatedBody))
	clone.Header.Set("Content-Length", strconv.Itoa(len(updatedBody)))
	clone.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(updatedBody)), nil
	}

	return t.base.RoundTrip(clone)
}

func rewriteAdaptiveThinkingBody(body []byte, effort string) ([]byte, error) {
	// langchaingo emits budget-based Anthropic thinking; adaptive thinking expects
	// thinking.type=adaptive plus a top-level output_config.effort. In the Anthropic
	// Messages API thinking and the sampling params live at the top level (unlike the
	// Bedrock Converse body).
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode Anthropic request body: %w", err)
	}

	thinking, ok := payload["thinking"].(map[string]any)
	if !ok {
		return body, nil
	}

	thinking["type"] = "adaptive"
	// Opus 4.7/4.8 default thinking.display to "omitted" (empty reasoning text);
	// force "summarized" so reasoning stays visible in the UI.
	thinking["display"] = "summarized"
	delete(thinking, "budget_tokens")
	payload["output_config"] = map[string]any{"effort": effort}

	// Adaptive Claude models reject sampling params (Opus 4.7+ return 400). langchaingo's
	// Messages payload only serializes temperature/top_p, so those are the only keys to strip.
	delete(payload, "temperature")
	delete(payload, "top_p")

	return json.Marshal(payload)
}
