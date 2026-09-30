-- Receiving a return: per-line disposition, variant restock, and the status
-- transition, in one statement.
--
-- SCO-186.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Why this is one function rather than three app-layer writes
-- ───────────────────────────────────────────────────────────────────────────
--
-- Receipt moves physical stock. Done as separate round trips -- write
-- dispositions, increment variants, flip status -- a failure between any two
-- leaves inventory that disagrees with the document explaining it. Stock
-- incremented against a return still sitting at `approved` is worse than a
-- receipt that did not happen, because nothing in the UI shows why the number
-- moved.
--
-- One function is one transaction, so either the goods are back on the shelf
-- and the return says so, or neither is true.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Authorization
-- ───────────────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER, because it writes `product_variants` rows that belong to
-- the brand's own catalogue while running as whoever clicked Receive. It
-- therefore authorizes explicitly, with the NULL arm spelled out: get_user_role
-- returns NULL for a non-member and `NULL NOT IN (...)` is NULL rather than
-- true, so a bare NOT IN would wave every outsider through. That is exactly the
-- hole SCO-189 found in void_invoice(), and it is not being repeated here.
--
-- EXECUTE is revoked from `anon` and granted to `authenticated` only. Revoking
-- from PUBLIC alone is NOT enough on Supabase: the platform's default
-- privileges grant EXECUTE on every new public function to `anon`,
-- `authenticated` and `service_role` directly, not through PUBLIC, so a bare
-- `REVOKE ... FROM PUBLIC` leaves `anon` able to call it. Name the roles.

CREATE OR REPLACE FUNCTION public.receive_return(
  p_return_id UUID,
  p_dispositions JSONB
)
RETURNS return_authorizations AS $$
DECLARE
  v_return return_authorizations;
  v_role user_role;
  v_line_count INTEGER;
  v_disposition_count INTEGER;
BEGIN
  SELECT * INTO v_return FROM return_authorizations WHERE id = p_return_id FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return % not found', p_return_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Brand-only, mirroring the boundary reject_non_brand_fulfillment_status()
  -- enforces on orders: a rep or buyer asks for a return, the brand decides
  -- what happened to the goods. Matches the `Brand can update returns` policy.
  v_role := get_user_role(v_return.organization_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'owner', 'member') THEN
    RAISE EXCEPTION 'Only the issuing brand can receive a return'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_return.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved return can be received (return % is %)',
      p_return_id, v_return.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Every line needs a disposition. Receiving goods without recording what
  -- happened to them leaves the return half-written, and the only person who
  -- can answer is holding the box right now.
  SELECT COUNT(*) INTO v_line_count FROM return_lines WHERE return_id = p_return_id;
  SELECT COUNT(*) INTO v_disposition_count
    FROM jsonb_array_elements(p_dispositions) AS d
    JOIN return_lines rl
      ON rl.id = (d->>'lineId')::UUID
     AND rl.return_id = p_return_id
   WHERE d->>'disposition' IN ('restock', 'damaged', 'destroy');

  IF v_disposition_count <> v_line_count THEN
    RAISE EXCEPTION 'Every line needs a disposition (% of % supplied)',
      v_disposition_count, v_line_count
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE return_lines rl
     SET disposition = d.value->>'disposition'
    FROM jsonb_array_elements(p_dispositions) AS d
   WHERE rl.id = (d.value->>'lineId')::UUID
     AND rl.return_id = p_return_id;

  -- Restock, with the three skips. See shouldRestock() in
  -- src/lib/server/returns/transitions.ts, which carries the same rule for the
  -- UI so it can explain in advance what will and will not go back.
  --
  --   * stock_qty IS NULL -- "no signal yet" per 20260422000001. Writing a
  --     number invents inventory tracking for an org that never opted in, and
  --     the first thing they would see is a count that appeared from nowhere.
  --
  --   * shopify_variant_id IS NOT NULL -- that migration states outright that
  --     Threadline must not edit stock_qty on a mirrored variant. Shopify is
  --     the system of record; our write is reverted on the next sync and the
  --     two disagree until then.
  --
  --   * no variant_id -- a free-entry line that never matched the catalogue has
  --     nothing to increment.
  --
  -- A skipped line still keeps its disposition, so the physical decision is on
  -- file either way.
  UPDATE product_variants pv
     SET stock_qty = pv.stock_qty + rl.qty
    FROM return_lines rl
   WHERE rl.return_id = p_return_id
     AND rl.variant_id = pv.id
     AND rl.disposition = 'restock'
     AND pv.stock_qty IS NOT NULL
     AND pv.shopify_variant_id IS NULL;

  UPDATE return_authorizations
     SET status = 'received',
         received_at = NOW(),
         received_by = auth.uid()
   WHERE id = p_return_id
  RETURNING * INTO v_return;

  RETURN v_return;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.receive_return(UUID, JSONB) IS
  'Receives an approved return: records per-line disposition, restocks eligible variants, and flips status, in one transaction. Brand-only, checked here with the NULL arm explicit. Skips restock for untracked and Shopify-mirrored variants.';

REVOKE ALL ON FUNCTION public.receive_return(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_return(UUID, JSONB) TO authenticated;
