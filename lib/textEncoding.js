const MOJIBAKE_PATTERN = /(?:Ã|Ä|Â|Æ|áº|á»|â|ðŸ|ChÆ|Sáº|Lá»)/g;

const mojibakeScore = value => (String(value || '').match(MOJIBAKE_PATTERN) || []).length;

export function repairMojibake(value) {
  if (typeof value !== 'string' || mojibakeScore(value) === 0) return value;
  let current = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = current.replace(/[\u0000-\u00ff]+/g, segment => {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(
          Uint8Array.from([...segment].map(character => character.codePointAt(0)))
        );
      } catch {
        return segment;
      }
    });
    if (mojibakeScore(candidate) >= mojibakeScore(current)) break;
    current = candidate;
  }
  return current;
}
