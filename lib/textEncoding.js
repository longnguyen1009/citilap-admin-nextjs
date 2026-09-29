const MOJIBAKE_PATTERN = /(?:Ã|Ä|Â|Æ|áº|á»|â|ðŸ|ChÆ|Sáº|Lá»)/g;

const mojibakeScore = value => (String(value || '').match(MOJIBAKE_PATTERN) || []).length;
const legacyBytes = new Map();
const legacyDecoder = new TextDecoder('windows-1252');
for (let byte = 0; byte < 256; byte++) legacyBytes.set(legacyDecoder.decode(Uint8Array.of(byte)), byte);

export function repairMojibake(value) {
  if (typeof value !== 'string' || mojibakeScore(value) === 0) return value;
  let current = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = current.replace(/[^ \t\r\n]+/g, segment => {
      if (!mojibakeScore(segment)) return segment;
      try {
        const bytes = [...segment].map(character => legacyBytes.get(character)
          ?? (character.codePointAt(0) <= 255 ? character.codePointAt(0) : undefined));
        if (bytes.includes(undefined)) return segment;
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
        return mojibakeScore(decoded) < mojibakeScore(segment) ? decoded : segment;
      } catch {
        return segment;
      }
    });
    if (mojibakeScore(candidate) >= mojibakeScore(current)) break;
    current = candidate;
  }
  return current;
}
