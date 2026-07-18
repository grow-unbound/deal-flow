CREATE INDEX IF NOT EXISTS idx_orders_buyer_app_access_window
  ON app.orders (
    tenant_id,
    buyer_id,
    (COALESCE((order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), created_at)) DESC
  )
  INCLUDE (is_buyer_app_order, total_amount, status, location_id)
  WHERE deleted_at IS NULL;
