package anthropic

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"pentagi/pkg/providers/pconfig"

	"github.com/vxcontrol/langchaingo/llms"
)

type adaptiveThinkingEffortContextKey struct{}

func withAdaptiveThinkingEffort(ctx context.Context, effort string) context.Context {
	if effort == "" {
		effort = string(llms.ReasoningHigh)
	}

	return context.WithValue(ctx, adaptiveThinkingEffortContextKey{}, effort)
}

func adaptiveThinkingEffortFromContext(ctx context.Context) (string, bool) {
	effort, ok := ctx.Value(adaptiveThinkingEffortContextKey{}).(string)
	return effort, ok && effort != ""
}

// adaptiveThinkingTransport rewrites the outgoing Anthropic Messages request body
// to use adaptive thinking when the call context carries an effort (set by
// prepareCallOptions). langchaingo only emits budget thinking, but Claude Opus
// 4.7/4.8 only support thinking.type=adaptive and reject sampling params.
type adaptiveThinkingTransport struct {
	base http.RoundTripper
}

func (t *adaptiveThinkingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	effort, ok := adaptiveThinkingEffortFromContext(req.Context())
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

	// Adaptive Claude models reject sampling params (Opus 4.7+ return 400 for any
	// temperature/top_p/top_k).
	delete(payload, "temperature")
	delete(payload, "top_p")
	delete(payload, "top_k")

	return json.Marshal(payload)
}

func (p *anthropicProvider) prepareCallOptions(
	ctx context.Context,
	opt pconfig.ProviderOptionsType,
	options []llms.CallOption,
) (context.Context, []llms.CallOption) {
	if !p.usesAdaptiveThinking(opt) {
		return ctx, options
	}

	reasoning, _ := p.reasoningConfigForType(opt)
	ctx = withAdaptiveThinkingEffort(ctx, string(reasoning.Effort))
	options = append(options, llms.WithReasoning(llms.ReasoningHigh, 0))

	return ctx, options
}

// usesAdaptiveThinking reports whether this agent's call must use adaptive thinking:
// either the agent config selected it, or the agent's model only supports adaptive
// (e.g. Opus 4.7/4.8, where budget thinking returns a 400).
func (p *anthropicProvider) usesAdaptiveThinking(opt pconfig.ProviderOptionsType) bool {
	if p.modelReasoningMode(opt) == pconfig.ModelReasoningAdaptiveOnly {
		return true
	}

	reasoning, ok := p.reasoningConfigForType(opt)
	return ok && reasoning.EffectiveMode() == pconfig.ReasoningModeAdaptive
}

// modelReasoningMode returns the reasoning capability declared in models.yml for
// the model assigned to this agent, or ModelReasoningNone if unknown.
func (p *anthropicProvider) modelReasoningMode(opt pconfig.ProviderOptionsType) pconfig.ModelReasoningMode {
	agentConfig := p.agentConfigForType(opt)
	if agentConfig == nil || agentConfig.Model == "" {
		return pconfig.ModelReasoningNone
	}

	for _, m := range p.models {
		if m.Name == agentConfig.Model && m.Reasoning != nil {
			return m.Reasoning.Mode
		}
	}

	return pconfig.ModelReasoningNone
}

func (p *anthropicProvider) reasoningConfigForType(opt pconfig.ProviderOptionsType) (pconfig.ReasoningConfig, bool) {
	agentConfig := p.agentConfigForType(opt)
	if agentConfig == nil || agentConfig.Reasoning.IsZero() {
		return pconfig.ReasoningConfig{}, false
	}

	return agentConfig.Reasoning, true
}

func (p *anthropicProvider) agentConfigForType(opt pconfig.ProviderOptionsType) *pconfig.AgentConfig {
	if p == nil || p.providerConfig == nil {
		return nil
	}

	switch opt {
	case pconfig.OptionsTypeSimple:
		return p.providerConfig.Simple
	case pconfig.OptionsTypeSimpleJSON:
		if p.providerConfig.SimpleJSON != nil {
			return p.providerConfig.SimpleJSON
		}
		return p.providerConfig.Simple
	case pconfig.OptionsTypePrimaryAgent:
		return p.providerConfig.PrimaryAgent
	case pconfig.OptionsTypeAssistant:
		if p.providerConfig.Assistant != nil {
			return p.providerConfig.Assistant
		}
		return p.providerConfig.PrimaryAgent
	case pconfig.OptionsTypeGenerator:
		return p.providerConfig.Generator
	case pconfig.OptionsTypeRefiner:
		return p.providerConfig.Refiner
	case pconfig.OptionsTypeAdviser:
		return p.providerConfig.Adviser
	case pconfig.OptionsTypeReflector:
		return p.providerConfig.Reflector
	case pconfig.OptionsTypeSearcher:
		return p.providerConfig.Searcher
	case pconfig.OptionsTypeEnricher:
		return p.providerConfig.Enricher
	case pconfig.OptionsTypeCoder:
		return p.providerConfig.Coder
	case pconfig.OptionsTypeInstaller:
		return p.providerConfig.Installer
	case pconfig.OptionsTypePentester:
		return p.providerConfig.Pentester
	default:
		return nil
	}
}
