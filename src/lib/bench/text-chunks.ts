export function chunksByBytes(text: string, limit = 400): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue;
    for (const character of [...word]) {
      const next = current + character;
      if (encoder.encode(next).length > limit && current) {
        chunks.push(current.trim());
        current = "";
      }
      current += character;
    }
    if (encoder.encode(current + " ").length > limit) {
      chunks.push(current.trim());
      current = "";
    } else current += " ";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
