/**
 * Utilities for text formatting.
 */

export function wrapLabelText(text: string, maxLength: number): string {
  const trimmedText = text.trim();
  if (trimmedText.length <= maxLength) return trimmedText;

  const words = trimmedText.split(/\s+/);
  if (words.length === 1) return chunkText(trimmedText, maxLength).join("\n");

  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxLength) {
      line = candidate;
      return;
    }

    if (line) lines.push(line);
    if (word.length <= maxLength) {
      line = word;
      return;
    }

    const chunks = chunkText(word, maxLength);
    lines.push(...chunks.slice(0, -1));
    line = chunks[chunks.length - 1] || "";
  });

  if (line) lines.push(line);
  return lines.join("\n");
}

export function chunkText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxLength) {
    chunks.push(text.slice(index, index + maxLength));
  }
  return chunks;
}
