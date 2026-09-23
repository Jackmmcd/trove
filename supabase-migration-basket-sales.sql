-- Selling a basket as a unit.
--
-- A basket was write-once: bought, then tracked forever. Closing one needs the
-- fact that it was closed, when, and at what prices — without which a sold
-- basket keeps claiming shares in the portfolio view and keeps showing an
-- unrealised P&L it no longer has.
--
-- sale_orders mirrors the shape of `orders`: [{ticker, shares, price, status}],
-- recorded per leg as the sells come back, so a partial close (one leg rejected
-- by the broker) is visible rather than averaged away.

ALTER TABLE basket_purchases
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sale_orders JSONB NOT NULL DEFAULT '[]';

-- The portfolio and basket pages both filter on "still open", per user.
CREATE INDEX IF NOT EXISTS basket_purchases_open_idx
  ON basket_purchases (user_id, sold_at);
