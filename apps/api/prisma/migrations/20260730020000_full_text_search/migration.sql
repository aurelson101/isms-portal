CREATE INDEX "DocumentTranslation_full_text_idx"
  ON "DocumentTranslation"
  USING GIN (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", '')));
