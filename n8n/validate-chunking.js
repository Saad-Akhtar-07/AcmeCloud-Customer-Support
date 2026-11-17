// Runs the n8n Code-node parser locally against the Markdown knowledge base.
// This validates the exact production parser without duplicating its logic.

const fs = require('fs');
const path = require('path');

async function main() {
  const knowledgeBasePath = path.resolve(__dirname, '..', 'Knowledge_Base');
  const parserPath = path.resolve(__dirname, 'parse-knowledge-base.js');
  const files = fs.readdirSync(knowledgeBasePath)
    .filter((fileName) => fileName.toLowerCase().endsWith('.md'))
    .sort();

  const inputItems = files.map((fileName) => ({
    binary: {
      data: {
        fileName,
        localPath: path.join(knowledgeBasePath, fileName),
      },
    },
  }));

  const parserSource = fs.readFileSync(parserPath, 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const executeParser = new AsyncFunction('$input', parserSource);
  const context = {
    helpers: {
      async getBinaryDataBuffer(itemIndex, binaryField) {
        const localPath = inputItems[itemIndex].binary[binaryField].localPath;
        return fs.promises.readFile(localPath);
      },
    },
  };

  const outputItems = await executeParser.call(context, { all: () => inputItems });
  const chunks = outputItems.map((item) => item.json);
  const tokenCounts = chunks.map((chunk) => chunk.estimated_tokens).sort((a, b) => a - b);
  const median = tokenCounts.length % 2
    ? tokenCounts[(tokenCounts.length - 1) / 2]
    : Math.round((tokenCounts[tokenCounts.length / 2 - 1] + tokenCounts[tokenCounts.length / 2]) / 2);
  const average = Math.round(tokenCounts.reduce((sum, value) => sum + value, 0) / tokenCounts.length);

  const sectionKeys = new Set(chunks.map((chunk) => `${chunk.document_code}:${chunk.section_number}`));
  const splitSectionKeys = new Set(
    chunks
      .filter((chunk) => chunk.section_parts > 1)
      .map((chunk) => `${chunk.document_code}:${chunk.section_number}`),
  );

  const documentRows = files.map((fileName) => {
    const documentChunks = chunks.filter((chunk) => chunk.source_path.endsWith(`/${fileName}`));
    const source = fs.readFileSync(path.join(knowledgeBasePath, fileName), 'utf8');
    const sections = [...source.matchAll(/^##\s+(.+)$/gm)].length;
    const splitSections = new Set(
      documentChunks
        .filter((chunk) => chunk.section_parts > 1)
        .map((chunk) => chunk.section_number),
    ).size;

    documentChunks.forEach((chunk, index) => {
      if (chunk.chunk_index !== index) {
        throw new Error(`${fileName}: non-contiguous chunk_index at ${index}`);
      }
      if (chunk.document_chunk_count !== documentChunks.length) {
        throw new Error(`${fileName}: incorrect document_chunk_count at chunk ${index}`);
      }
    });

    return {
      document: fileName,
      sections,
      splitSections,
      chunks: documentChunks.length,
      minTokens: Math.min(...documentChunks.map((chunk) => chunk.estimated_tokens)),
      maxTokens: Math.max(...documentChunks.map((chunk) => chunk.estimated_tokens)),
    };
  });

  const overLimit = chunks.filter((chunk) => chunk.estimated_tokens > 500);
  console.table(documentRows);
  console.log({
    sourceFiles: files.length,
    headingSections: sectionKeys.size,
    splitSections: splitSectionKeys.size,
    finalChunks: chunks.length,
    minEstimatedTokens: tokenCounts[0],
    medianEstimatedTokens: median,
    averageEstimatedTokens: average,
    maxEstimatedTokens: tokenCounts[tokenCounts.length - 1],
    chunksOver500: overLimit.length,
  });

  if (overLimit.length) {
    throw new Error(`Validation failed: ${overLimit.length} chunks exceed 500 estimated tokens`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
