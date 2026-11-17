with document_row as (
  insert into public.knowledge_documents (
    company_id,
    document_code,
    title,
    version,
    status,
    purpose,
    audience,
    tags,
    source_path,
    source_hash
  )
  values (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7::text[],
    $8::text[],
    $9,
    md5($10)
  )
  on conflict (company_id, document_code, version)
  do update set
    title = excluded.title,
    status = excluded.status,
    purpose = excluded.purpose,
    audience = excluded.audience,
    tags = excluded.tags,
    source_path = excluded.source_path,
    source_hash = excluded.source_hash,
    ingested_at = now(),
    updated_at = now()
  returning id
),
upserted_chunk as (
  insert into public.knowledge_chunks (
    document_id,
    chunk_index,
    section_number,
    section_title,
    content,
    metadata,
    content_hash,
    embedding
  )
  select
    document_row.id,
    $11,
    $12,
    $13,
    $14,
    $15::jsonb,
    md5($14),
    $16::extensions.vector
  from document_row
  on conflict (document_id, chunk_index)
  do update set
    section_number = excluded.section_number,
    section_title = excluded.section_title,
    content = excluded.content,
    metadata = excluded.metadata,
    content_hash = excluded.content_hash,
    embedding = excluded.embedding,
    updated_at = now()
  returning id, document_id, chunk_index, section_title
),
stale_chunk_cleanup as (
  delete from public.knowledge_chunks existing_chunk
  using document_row
  where existing_chunk.document_id = document_row.id
    and existing_chunk.chunk_index >= $17::integer
  returning existing_chunk.id
)
select id, document_id, chunk_index, section_title
from upserted_chunk;
