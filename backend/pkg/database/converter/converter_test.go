package converter

import (
	"testing"

	"pentagi/pkg/graph/model"
	"pentagi/pkg/providers/pconfig"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vxcontrol/langchaingo/llms"
)

func TestIsAgentTool(t *testing.T) {
	tests := []struct {
		name         string
		functionName string
		expected     bool
	}{
		// Agent tools
		{"coder is agent", "coder", true},
		{"pentester is agent", "pentester", true},
		{"maintenance is agent", "maintenance", true},
		{"memorist is agent", "memorist", true},
		{"search is agent", "search", true},
		{"advice is agent", "advice", true},

		// Agent result tools (also agents)
		{"coder_result is agent", "code_result", true},
		{"hack_result is agent", "hack_result", true},
		{"maintenance_result is agent", "maintenance_result", true},
		{"memorist_result is agent", "memorist_result", true},
		{"search_result is agent", "search_result", true},
		{"enricher_result is agent", "enricher_result", true},
		{"report_result is agent", "report_result", true},
		{"subtask_list is agent", "subtask_list", true},
		{"subtask_patch is agent", "subtask_patch", true},

		// Non-agent tools
		{"terminal is not agent", "terminal", false},
		{"file is not agent", "file", false},
		{"browser is not agent", "browser", false},
		{"google is not agent", "google", false},
		{"duckduckgo is not agent", "duckduckgo", false},
		{"tavily is not agent", "tavily", false},
		{"sploitus is not agent", "sploitus", false},
		{"searxng is not agent", "searxng", false},
		{"search_in_memory is not agent", "search_in_memory", false},
		{"store_guide is not agent", "store_guide", false},
		{"done is not agent", "done", false},
		{"ask is not agent", "ask", false},

		// Unknown tool
		{"unknown tool is not agent", "unknown_tool", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isAgentTool(tt.functionName)
			if result != tt.expected {
				t.Errorf("isAgentTool(%q) = %v, want %v", tt.functionName, result, tt.expected)
			}
		})
	}
}

func TestConvertModelsReasoning(t *testing.T) {
	models := pconfig.ModelsConfig{
		{Name: "ao", Reasoning: &pconfig.ModelReasoningInfo{
			Mode:    pconfig.ModelReasoningAdaptiveOnly,
			Efforts: []llms.ReasoningEffort{llms.ReasoningLow, llms.ReasoningEffort("xhigh")},
		}},
		{Name: "ad", Reasoning: &pconfig.ModelReasoningInfo{Mode: pconfig.ModelReasoningAdaptive}},
		{Name: "bd", Reasoning: &pconfig.ModelReasoningInfo{Mode: pconfig.ModelReasoningBudget}},
		{Name: "none"},
	}

	byName := make(map[string]*model.ModelConfig)
	for _, m := range ConvertModels(models) {
		byName[m.Name] = m
	}

	require.NotNil(t, byName["ao"].Reasoning)
	require.NotNil(t, byName["ao"].Reasoning.Mode)
	assert.Equal(t, model.ModelReasoningModeAdaptiveOnly, *byName["ao"].Reasoning.Mode, "hyphenated pconfig value must map to the GraphQL underscore enum")
	assert.Equal(t, []model.ReasoningEffort{model.ReasoningEffort("low"), model.ReasoningEffort("xhigh")}, byName["ao"].Reasoning.Efforts)

	require.NotNil(t, byName["ad"].Reasoning.Mode)
	assert.Equal(t, model.ModelReasoningModeAdaptive, *byName["ad"].Reasoning.Mode)
	require.NotNil(t, byName["bd"].Reasoning.Mode)
	assert.Equal(t, model.ModelReasoningModeBudget, *byName["bd"].Reasoning.Mode)

	assert.Nil(t, byName["none"].Reasoning, "model without a reasoning descriptor maps to nil")
}
