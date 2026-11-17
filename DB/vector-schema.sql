create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'acmecloud',
  document_code text not null,
  title text not null,
  version text not null,
  status text not null default 'approved' check (
    status in ('draft', 'approved', 'retired')
  ),
  purpose text,
  audience text[] not null default '{}',
  tags text[] not null default '{}',
  source_path text not null,
  source_hash text not null,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, document_code, version)
);

create table if not exists public.knowledge_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null
    references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  section_number text,
  section_title text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  embedding extensions.vector(1024) not null,
  fts tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(section_title, '') || ' ' || coalesce(content, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, chunk_index),
  unique (document_id, content_hash)
);

create index if not exists knowledge_chunks_document_id_idx
  on public.knowledge_chunks(document_id);

create index if not exists knowledge_chunks_metadata_idx
  on public.knowledge_chunks using gin(metadata);

create index if not exists knowledge_chunks_fts_idx
  on public.knowledge_chunks using gin(fts);

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;

create or replace function public.match_knowledge(
  query_embedding extensions.vector(1024),
  match_count integer default 5,
  filter jsonb default '{}'::jsonb
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.content,
    c.metadata || jsonb_build_object(
      'company_id', d.company_id,
      'document_code', d.document_code,
      'title', d.title,
      'version', d.version,
      'status', d.status,
      'section_number', c.section_number,
      'section_title', c.section_title
    ) as metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where d.status = 'approved'
    and c.metadata @> filter
  order by c.embedding <=> query_embedding
  limit least(greatest(coalesce(match_count, 5), 1), 50);
$$;
