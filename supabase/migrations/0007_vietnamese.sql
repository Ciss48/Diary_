-- Phase 17: Vietnamese meaning + explanation cache

-- 1. Add Vietnamese columns to vocab_definitions
ALTER TABLE public.vocab_definitions
  ADD COLUMN IF NOT EXISTS vi_meaning text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vi_source text NOT NULL DEFAULT '';

-- 2. Explanation cache table (keyed on normalised text pair)
CREATE TABLE IF NOT EXISTS public.vi_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norm_corrected text NOT NULL,
  norm_original text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (norm_corrected, norm_original)
);

ALTER TABLE public.vi_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vi_explanations"
  ON public.vi_explanations FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — writes via service role only.

CREATE INDEX IF NOT EXISTS idx_vi_explanations_pair
  ON public.vi_explanations(norm_corrected, norm_original);
