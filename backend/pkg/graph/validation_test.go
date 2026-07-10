package graph

import (
	"strings"
	"testing"
)

func strOfLen(n int) *string {
	s := strings.Repeat("a", n)
	return &s
}

func TestValidateKnowledgeFieldLengths(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		question    *string
		description *string
		codeLang    *string
		wantErr     bool
	}{
		{name: "all empty/nil is valid", content: ""},
		{name: "all fields at their max is valid",
			content:     strings.Repeat("a", maxKnowledgeContentLen),
			question:    strOfLen(maxKnowledgeQuestionLen),
			description: strOfLen(maxKnowledgeDescriptionLen),
			codeLang:    strOfLen(maxKnowledgeCodeLangLen),
		},
		{name: "content one over max", content: strings.Repeat("a", maxKnowledgeContentLen+1), wantErr: true},
		{name: "question one over max", question: strOfLen(maxKnowledgeQuestionLen + 1), wantErr: true},
		{name: "description one over max", description: strOfLen(maxKnowledgeDescriptionLen + 1), wantErr: true},
		{name: "code language one over max", codeLang: strOfLen(maxKnowledgeCodeLangLen + 1), wantErr: true},
		{name: "nil optionals with content at max", content: strings.Repeat("a", maxKnowledgeContentLen)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateKnowledgeFieldLengths(tt.content, tt.question, tt.description, tt.codeLang)
			if tt.wantErr && err == nil {
				t.Fatalf("expected an error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}
