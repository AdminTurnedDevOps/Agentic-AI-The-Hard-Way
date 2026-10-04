import { describe, expect, it } from 'vitest';
import { displayValue, isSecret, tokenize, varsInText } from '../../src/lib/vars';

describe('tokenize', () => {
  it('finds $VAR and ${VAR}', () => {
    expect(tokenize('curl "$INGRESS_GW_ADDRESS:8080/ollama"')).toEqual([
      { type: 'text', value: 'curl "' },
      { type: 'var', name: 'INGRESS_GW_ADDRESS', raw: '$INGRESS_GW_ADDRESS' },
      { type: 'text', value: ':8080/ollama"' },
    ]);
    expect(tokenize('gs://${BUCKET_NAME}/x')).toEqual([
      { type: 'text', value: 'gs://' },
      { type: 'var', name: 'BUCKET_NAME', raw: '${BUCKET_NAME}' },
      { type: 'text', value: '/x' },
    ]);
  });
  it('leaves assignments, command substitution, lowercase and shell builtins as text', () => {
    const text = 'export INGRESS_GW_ADDRESS=$(kubectl get svc)\necho $HOME $sid $i';
    expect(tokenize(text)).toEqual([{ type: 'text', value: text }]);
  });
  it('marks every occurrence, including inside heredoc YAML', () => {
    const text = 'stringData:\n  Authorization: $ANTHROPIC_API_KEY\n  OPENAI_API_KEY: ${ANTHROPIC_API_KEY}\n';
    const vars = tokenize(text).filter((t) => t.type === 'var');
    expect(vars).toEqual([
      { type: 'var', name: 'ANTHROPIC_API_KEY', raw: '$ANTHROPIC_API_KEY' },
      { type: 'var', name: 'ANTHROPIC_API_KEY', raw: '${ANTHROPIC_API_KEY}' },
    ]);
  });
  it('round-trips: joining tokens reproduces the input', () => {
    const text = 'a $X_Y b ${Z1} $HOME c';
    expect(tokenize(text).map((t) => (t.type === 'text' ? t.value : t.raw)).join('')).toBe(text);
  });
  it('leaves single-letter names as text', () => {
    const text = 'jq -r "$A" ${B}';
    expect(tokenize(text)).toEqual([{ type: 'text', value: text }]);
  });
});

describe('isSecret', () => {
  it('flags key/token/secret/password/credential names', () => {
    for (const n of ['ANTHROPIC_API_KEY', 'GH_TOKEN', 'CLIENT_SECRET', 'DB_PASSWORD', 'AWS_CREDENTIALS']) expect(isSecret(n)).toBe(true);
    for (const n of ['INGRESS_GW_ADDRESS', 'BUCKET_NAME', 'PROJECT_ID']) expect(isSecret(n)).toBe(false);
  });
});

describe('displayValue', () => {
  it('substitutes filled, non-secret values', () => {
    expect(displayValue('INGRESS_GW_ADDRESS', '$INGRESS_GW_ADDRESS', { INGRESS_GW_ADDRESS: '20.84.113.7' })).toBe('20.84.113.7');
  });
  it('keeps the raw text for blank values and for secrets', () => {
    expect(displayValue('X_Y', '${X_Y}', { X_Y: '   ' })).toBe('${X_Y}');
    expect(displayValue('X_Y', '$X_Y', {})).toBe('$X_Y');
    expect(displayValue('OPENAI_API_KEY', '$OPENAI_API_KEY', { OPENAI_API_KEY: 'sk-leak' })).toBe('$OPENAI_API_KEY');
  });
});

describe('varsInText', () => {
  it('lists unique names in order of first use', () => {
    expect(varsInText('$BB $AA ${BB} $HOME')).toEqual(['BB', 'AA']);
  });
});
