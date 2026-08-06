-- Vocabulary definitions — shared cache, not user-specific data
CREATE TABLE public.vocab_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headword text NOT NULL,
  ipa text NOT NULL DEFAULT '',
  part_of_speech text NOT NULL DEFAULT '',
  definition text NOT NULL DEFAULT '',
  example text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'dictionary'
    CHECK (source IN ('dictionary', 'llm')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (headword)
);

-- RLS: any authenticated user can read, only server (service role) writes
ALTER TABLE public.vocab_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read definitions"
  ON public.vocab_definitions FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated role.
-- Writes go through the Route Handler using the service role client.

-- Saved vocabulary — per-user, per-entry
CREATE TABLE public.saved_vocab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  definition_id uuid REFERENCES public.vocab_definitions(id) ON DELETE SET NULL,
  display_form text NOT NULL,
  original_form text NOT NULL DEFAULT '',
  headword text NOT NULL,
  change_type text NOT NULL DEFAULT ''
    CHECK (change_type IN ('grammar', 'vocabulary', 'style', 'spelling', '')),
  status text NOT NULL DEFAULT 'learning'
    CHECK (status IN ('learning', 'known')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_id, headword)
);

ALTER TABLE public.saved_vocab ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own saved vocab"
  ON public.saved_vocab FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved vocab"
  ON public.saved_vocab FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved vocab"
  ON public.saved_vocab FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved vocab"
  ON public.saved_vocab FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_saved_vocab_user_entry ON public.saved_vocab(user_id, entry_id);
CREATE INDEX idx_saved_vocab_user_status ON public.saved_vocab(user_id, status);
CREATE INDEX idx_vocab_definitions_headword ON public.vocab_definitions(headword);
