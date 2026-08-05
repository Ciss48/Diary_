-- Add stage tracking to ai_suggestions.
-- stage 1 = "Fix my English" (corrections), stage 2 = "Suggest better English" (style).
-- Existing rows default to stage 1.
-- parent_id links a stage-2 row to the stage-1 row it was derived from.

ALTER TABLE public.ai_suggestions
  ADD COLUMN stage smallint NOT NULL DEFAULT 1,
  ADD COLUMN parent_id uuid REFERENCES public.ai_suggestions(id) ON DELETE CASCADE;

-- Enforce: stage must be 1 or 2
ALTER TABLE public.ai_suggestions
  ADD CONSTRAINT ai_suggestions_stage_check
    CHECK (stage IN (1, 2));

-- Enforce: stage 1 has no parent, stage 2 always has a parent
ALTER TABLE public.ai_suggestions
  ADD CONSTRAINT ai_suggestions_parent_check
    CHECK (
      (stage = 1 AND parent_id IS NULL) OR
      (stage = 2 AND parent_id IS NOT NULL)
    );

-- Index for finding stage-2 rows by their parent
CREATE INDEX ai_suggestions_parent_idx
  ON public.ai_suggestions (parent_id)
  WHERE parent_id IS NOT NULL;
