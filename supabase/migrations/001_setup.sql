-- Enable the pgvector extension — gives us the `vector` type and <=> operator
create extension if not exists vector;

-- Documents table — stores chunks + their embeddings
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  embedding   vector(1536) not null,   -- must match EMBED_MODEL output dimensions
  source      text not null,           -- URL or document title for citations
  chunk_index integer not null,        -- position in the original document
  session_id  uuid not null,           -- ties chunks to a research session
  created_at  timestamptz default now()
);

-- Index for fast cosine similarity search.
-- ivfflat: inverted file index — approximate nearest neighbour search.
-- Exact search (no index) is O(n) — scans every row. Fine for <10k rows.
-- ivfflat is O(√n) — fast enough for millions of rows.
-- lists = 100: number of clusters. Rule of thumb: sqrt(total_rows).
create index if not exists documents_embedding_idx
  on documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Row Level Security — only authenticated users can read their own session's chunks
alter table documents enable row level security;

create policy "Users can read own session chunks"
  on documents for select
  using (auth.uid()::text = session_id::text);

-- match_documents: the Postgres function our retrieval code calls via supabase.rpc()
-- It returns chunks ordered by cosine similarity to the query_embedding.
create or replace function match_documents(
  query_embedding   vector(1536),
  match_threshold   float,
  match_count       int,
  filter_session_id uuid default null
)
returns table (
  id          uuid,
  content     text,
  source      text,
  chunk_index integer,
  similarity  float
)
language sql stable
as $$
  select
    id,
    content,
    source,
    chunk_index,
    -- 1 - cosine_distance converts distance (lower=closer) to similarity (higher=closer)
    1 - (embedding <=> query_embedding) as similarity
  from documents
  where
    -- Apply session filter only when provided
    (filter_session_id is null or session_id = filter_session_id)
    -- Pre-filter by threshold to avoid returning irrelevant chunks
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding   -- ascending distance = descending similarity
  limit match_count;
$$;
