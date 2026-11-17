// n8n Code node: Run Once for All Items
// Input: binary Markdown files from Read/Write Files from Disk.
// Output: one JSON item per final hybrid chunk.

const inputItems = $input.all();
const chunks = [];

// Qwen's exact tokenizer is not available inside the n8n Code node, so this
// uses the common English-text approximation of four characters per token.
// Heading boundaries remain authoritative; only oversized sections are split.
const MAX_ESTIMATED_TOKENS = 500;
const TARGET_ESTIMATED_TOKENS = 350;
const OVERLAP_ESTIMATED_TOKENS = 60;

function capture(text, pattern, fallback = '') {
  const match = text.match(pattern);
  return match ? match[1].trim() : fallback;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function splitByWords(text, targetTokens = TARGET_ESTIMATED_TOKENS) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const pieces = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && estimateTokens(candidate) > targetTokens) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

function splitOversizedParagraph(paragraph) {
  if (estimateTokens(paragraph) <= TARGET_ESTIMATED_TOKENS) {
    return [paragraph];
  }

  const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
  const pieces = [];
  let current = '';

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();

    if (estimateTokens(cleanSentence) > TARGET_ESTIMATED_TOKENS) {
      if (current) {
        pieces.push(current);
        current = '';
      }
      pieces.push(...splitByWords(cleanSentence));
      continue;
    }

    const candidate = current ? `${current} ${cleanSentence}` : cleanSentence;
    if (current && estimateTokens(candidate) > TARGET_ESTIMATED_TOKENS) {
      pieces.push(current);
      current = cleanSentence;
    } else {
      current = candidate;
    }
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

function paragraphBlocks(content) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((value) => value.trim())
    .filter(Boolean);

  const blocks = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];

    // Keep a Markdown subheading attached to the paragraph that follows it.
    if (/^###\s+/.test(paragraph) && paragraphs[index + 1]) {
      blocks.push(`${paragraph}\n\n${paragraphs[index + 1]}`);
      index += 1;
      continue;
    }

    blocks.push(paragraph);
  }

  return blocks.flatMap(splitOversizedParagraph);
}

function splitSection(content) {
  if (estimateTokens(content) <= MAX_ESTIMATED_TOKENS) {
    return [content];
  }

  const blocks = paragraphBlocks(content);
  const parts = [];
  let currentBlocks = [];

  for (const block of blocks) {
    const candidate = [...currentBlocks, block].join('\n\n');

    if (currentBlocks.length && estimateTokens(candidate) > TARGET_ESTIMATED_TOKENS) {
      parts.push(currentBlocks.join('\n\n').trim());

      const overlap = [];
      let overlapTokens = 0;
      for (let index = currentBlocks.length - 1; index >= 0; index -= 1) {
        const blockTokens = estimateTokens(currentBlocks[index]);
        if (overlapTokens + blockTokens > OVERLAP_ESTIMATED_TOKENS) {
          break;
        }
        overlap.unshift(currentBlocks[index]);
        overlapTokens += blockTokens;
      }

      currentBlocks = overlap;
    }

    // If overlap plus the new block would exceed the hard limit, discard the
    // overlap. Retrieval context is useful, but respecting the limit wins.
    if (estimateTokens([...currentBlocks, block].join('\n\n')) > MAX_ESTIMATED_TOKENS) {
      currentBlocks = [];
    }

    currentBlocks.push(block);
  }

  if (currentBlocks.length) {
    parts.push(currentBlocks.join('\n\n').trim());
  }

  return parts.filter(Boolean);
}

for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex += 1) {
  const item = inputItems[itemIndex];
  const binaryField = Object.keys(item.binary ?? {})[0];

  if (!binaryField) {
    throw new Error(`Input item ${itemIndex} does not contain a binary Markdown file`);
  }

  const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryField);
  const sourceText = buffer.toString('utf8').replace(/\r\n/g, '\n');
  const fileName = item.binary[binaryField].fileName ?? `knowledge-${itemIndex}.md`;

  const title = capture(sourceText, /^#\s+(.+)$/m);
  const documentCode = capture(sourceText, /^Document ID:\s*(.+)$/mi);
  const version = capture(sourceText, /^Version:\s*(.+)$/mi, '1.0');
  const audienceText = capture(sourceText, /^Audience:\s*(.+)$/mi);
  const tagsText = capture(sourceText, /^Tags:\s*(.+)$/mi);
  const purpose = capture(sourceText, /^\*\*Purpose:\*\*\s*(.+)$/mi);

  if (!title || !documentCode) {
    throw new Error(`Missing title or Document ID in ${fileName}`);
  }

  const audience = audienceText
    .split(/,|\band\b/i)
    .map((value) => value.trim())
    .filter(Boolean);

  const tags = tagsText
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const headings = [...sourceText.matchAll(/^##\s+(.+)$/gm)];
  const documentChunkStart = chunks.length;
  let outputChunkIndex = 0;

  headings.forEach((heading, sectionIndex) => {
    const sectionHeading = heading[1].trim();
    const sectionStart = heading.index + heading[0].length;
    const sectionEnd = headings[sectionIndex + 1]?.index ?? sourceText.length;
    const content = sourceText.slice(sectionStart, sectionEnd).trim();
    const numbered = sectionHeading.match(/^(\d+)\.\s*(.+)$/);
    const sectionNumber = numbered ? numbered[1] : String(sectionIndex + 1);
    const sectionTitle = numbered ? numbered[2].trim() : sectionHeading;

    const sectionParts = splitSection(content);

    sectionParts.forEach((partContent, partIndex) => {
      const estimatedTokens = estimateTokens(partContent);
      const metadata = {
        company_id: 'acmecloud',
        document_code: documentCode,
        title,
        version,
        status: 'approved',
        section_number: sectionNumber,
        section_title: sectionTitle,
        section_part: partIndex + 1,
        section_parts: sectionParts.length,
        estimated_tokens: estimatedTokens,
        chunking_strategy: 'heading-paragraph-token-aware',
        tags,
        source_file: fileName,
      };

      const embeddingInput = [
        'AcmeCloud customer-support knowledge base',
        `Document: ${title}`,
        `Document ID: ${documentCode}`,
        `Version: ${version}`,
        `Section: ${sectionHeading}`,
        sectionParts.length > 1 ? `Part: ${partIndex + 1} of ${sectionParts.length}` : '',
        tags.length ? `Tags: ${tags.join(', ')}` : '',
        '',
        partContent,
      ].filter((line) => line !== '').join('\n');

      chunks.push({
        json: {
          company_id: 'acmecloud',
          document_code: documentCode,
          title,
          version,
          status: 'approved',
          purpose,
          audience,
          tags,
          source_path: `/home/node/.n8n-files/acmecloud-kb/${fileName}`,
          source_content: sourceText,
          chunk_index: outputChunkIndex,
          section_number: sectionNumber,
          section_title: sectionTitle,
          section_part: partIndex + 1,
          section_parts: sectionParts.length,
          estimated_tokens: estimatedTokens,
          content: partContent,
          metadata,
          embedding_input: embeddingInput,
        },
        pairedItem: { item: itemIndex },
      });

      outputChunkIndex += 1;
    });
  });

  // Every chunk carries the final count for its document. The Postgres upsert
  // uses this value to remove old trailing chunks when a document gets shorter.
  const documentChunkCount = chunks.length - documentChunkStart;
  for (let chunkPosition = documentChunkStart; chunkPosition < chunks.length; chunkPosition += 1) {
    chunks[chunkPosition].json.document_chunk_count = documentChunkCount;
    chunks[chunkPosition].json.metadata.document_chunk_count = documentChunkCount;
  }
}

return chunks;
