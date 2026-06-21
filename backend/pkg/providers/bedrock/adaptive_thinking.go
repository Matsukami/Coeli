package bedrock

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"

	"pentagi/pkg/providers/pconfig"

	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

func addAdaptiveThinkingMiddleware(stack *middleware.Stack) error {
	return stack.Build.Add(middleware.BuildMiddlewareFunc(
		"PentAGIBedrockAdaptiveThinking",
		func(ctx context.Context, in middleware.BuildInput, next middleware.BuildHandler) (
			middleware.BuildOutput,
			middleware.Metadata,
			error,
		) {
			effort, ok := pconfig.AdaptiveEffortFromContext(ctx)
			if !ok {
				return next.HandleBuild(ctx, in)
			}

			req, ok := in.Request.(*smithyhttp.Request)
			if !ok || req.GetStream() == nil {
				return next.HandleBuild(ctx, in)
			}

			body, err := io.ReadAll(req.GetStream())
			if err != nil {
				return middleware.BuildOutput{}, middleware.Metadata{}, fmt.Errorf("read Bedrock request body: %w", err)
			}

			updatedBody, err := rewriteAdaptiveThinkingBody(body, effort)
			if err != nil {
				return middleware.BuildOutput{}, middleware.Metadata{}, err
			}

			updatedReq, err := req.SetStream(bytes.NewReader(updatedBody))
			if err != nil {
				return middleware.BuildOutput{}, middleware.Metadata{}, fmt.Errorf("replace Bedrock request body: %w", err)
			}
			updatedReq.ContentLength = int64(len(updatedBody))
			updatedReq.Header.Set("Content-Length", strconv.Itoa(len(updatedBody)))
			in.Request = updatedReq

			return next.HandleBuild(ctx, in)
		},
	), middleware.After)
}

func rewriteAdaptiveThinkingBody(body []byte, effort string) ([]byte, error) {
	// langchaingo currently emits budget-based Anthropic thinking for Bedrock;
	// Claude adaptive thinking expects thinking.type=adaptive plus output_config.effort.
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode Bedrock request body: %w", err)
	}

	fields, ok := payload["additionalModelRequestFields"].(map[string]any)
	if !ok {
		return body, nil
	}

	thinking, ok := fields["thinking"].(map[string]any)
	if !ok {
		return body, nil
	}

	thinking["type"] = "adaptive"
	// Opus 4.7/4.8 default thinking.display to "omitted" (empty reasoning text);
	// force "summarized" so reasoning stays visible in the UI.
	thinking["display"] = "summarized"
	delete(thinking, "budget_tokens")
	fields["output_config"] = map[string]any{
		"effort": effort,
	}

	// Adaptive Claude models reject sampling params (Opus 4.7+ return 400 for any
	// temperature/top_p/top_k); drop them from the Converse inferenceConfig.
	if inferenceConfig, ok := payload["inferenceConfig"].(map[string]any); ok {
		delete(inferenceConfig, "temperature")
		delete(inferenceConfig, "topP")
	}

	updatedBody, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode Bedrock request body: %w", err)
	}

	return updatedBody, nil
}
