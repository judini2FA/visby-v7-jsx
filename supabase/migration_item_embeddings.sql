-- Semantic search: a text-embedding vector per listing, stored as a plain float array in jsonb. No
-- pgvector extension required — cosine similarity is computed in-app (mirrors the existing Orama
-- in-memory index + 10s TTL). Optional column: search fail-softs to the Orama BM25 engine, and that to
-- SQL ilike, whenever embeddings are absent. `embedding_model` lets a model change trigger re-embedding.
alter table items add column if not exists embedding       jsonb;
alter table items add column if not exists embedding_model text;
