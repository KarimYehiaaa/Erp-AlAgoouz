/** Require electron-builder's authenticated Windows publisher metadata before
 * contacting the update feed. Unsigned installers have no trusted publisher.
 */
export function hasTrustedUpdatePublisher(updateMetadata: string): boolean {
  const lines = updateMetadata.split(/\r?\n/);
  const publisherLine = lines.findIndex((line) => /^publisherName\s*:/.test(line.trim()));
  if (publisherLine < 0) return false;

  const publisherIndent = lines[publisherLine].match(/^\s*/)?.[0].length ?? 0;
  const rawInlineValue = lines[publisherLine].trim().slice('publisherName:'.length);
  const inlineValue = rawInlineValue.replace(/\s+#.*$/, '').trim();
  const normalizedInlineValue = inlineValue.replace(/^(['"])(.*)\1$/s, '$2').trim();
  if (
    normalizedInlineValue &&
    !/^(?:null|~)$/i.test(normalizedInlineValue) &&
    !/^\[\s*\]$/.test(normalizedInlineValue)
  ) {
    return true;
  }

  for (const line of lines.slice(publisherLine + 1)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;

    const indentation = line.match(/^\s*/)?.[0].length ?? 0;
    if (indentation <= publisherIndent) break;
    return /^-\s+\S/.test(value);
  }

  return false;
}
