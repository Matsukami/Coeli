import { describe, expect, it } from 'vitest';

import { TAG_RE } from './editor-tag-highlight';
import { VARIABLE_RE } from './editor-variable-highlight';

// Decorations highlight per text node via `node.text.matchAll(RE)`; assert the RE itself matches the
// right spans and — critically — does NOT false-positive on prose that merely contains < or {{.
const matches = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m[0]);

describe('VARIABLE_RE — {{ go-template actions }}', () => {
    it.each([
        ['{{.Var}}', ['{{.Var}}']],
        ['{{- if .X}}', ['{{- if .X}}']],
        ['{{end}}', ['{{end}}']],
        ['{{.X | upper}}', ['{{.X | upper}}']],
        ['{{printf "%d" .N}}', ['{{printf "%d" .N}}']],
        ['{{- .B -}}', ['{{- .B -}}']],
        ['a {{.X}} b {{.Y}} c', ['{{.X}}', '{{.Y}}']],
    ])('matches %s', (input, expected) => {
        expect(matches(VARIABLE_RE, input)).toEqual(expected);
    });

    it.each(['{single brace}', '${shell}', 'open {{ no close', 'a }} before {{ open'])(
        'does NOT match %s',
        (input) => {
            expect(matches(VARIABLE_RE, input)).toEqual([]);
        },
    );
});

describe('TAG_RE — <xml-like tags>', () => {
    it.each([
        ['<container_environment>', ['<container_environment>']],
        ['</language_policy>', ['</language_policy>']],
        ['<specialist name="searcher">', ['<specialist name="searcher">']],
        ['<tool/>', ['<tool/>']],
        ['<a_b-c>', ['<a_b-c>']],
    ])('matches %s', (input, expected) => {
        expect(matches(TAG_RE, input)).toEqual(expected);
    });

    it.each([
        'count a < b here', // less-than, space after <
        'loop x<5 times', // digit after <
        'rating <3', // not a tag
        'empty <>',
        'spaced < tag>',
        '<https://example.com>', // markdown autolink — must NOT be a tag
        '<!-- a comment -->', // html comment
    ])('does NOT match %s', (input) => {
        expect(matches(TAG_RE, input)).toEqual([]);
    });

    it('documented false-positive: a single-letter <b> in prose is highlighted (harmless, view-only)', () => {
        expect(matches(TAG_RE, 'if a<b> then')).toEqual(['<b>']);
    });
});
