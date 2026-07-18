-- Metrics V2 Phase 7 follow-up: V2-only detail bootstrap RPCs.
-- Analytic card payloads in this migration read Metrics V2 tables/read models only.
-- Base entity tables are used only for ownership/header labels.

CREATE OR REPLACE FUNCTION app.metrics_v2_detail_card(
  p_id text,
  p_representation text,
  p_title text,
  p_subtitle text,
  p_time_basis text,
  p_availability text,
  p_body jsonb
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_id,
    'representation', p_representation,
    'title', p_title,
    'subtitle', p_subtitle,
    'time_basis', p_time_basis,
    'availability', p_availability,
    'body', COALESCE(p_body, '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION app.metrics_v2_empty_card_body(
  p_title text,
  p_description text,
  p_tone text DEFAULT 'unavailable'
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'title', p_title,
    'description', p_description,
    'tone', p_tone
  );
$$;

CREATE OR REPLACE FUNCTION app.metrics_v2_assert_detail_period(
  p_period text,
  p_allowed text[]
) RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text := lower(COALESCE(NULLIF(p_period, ''), p_allowed[1]));
BEGIN
  IF NOT v_period = ANY (p_allowed) THEN
    RAISE EXCEPTION 'invalid detail period: %', p_period USING ERRCODE = '22023';
  END IF;
  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_customer_detail_v2(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_period text DEFAULT '90d',
  p_history_period text DEFAULT '12m',
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_history text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit_top, 20), 1), 20);
  v_buyer app.buyers%ROWTYPE;
  v_metrics app.metrics_buyer_snapshot%ROWTYPE;
  v_cards jsonb := '[]'::jsonb;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['90d']);
  v_history := app.metrics_v2_assert_detail_period(p_history_period, ARRAY['12m', 'ytd', '3m']);

  SELECT * INTO v_buyer
  FROM app.buyers
  WHERE tenant_id = p_tenant_id AND id = p_buyer_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_metrics
  FROM app.metrics_buyer_snapshot
  WHERE tenant_id = p_tenant_id AND buyer_id = p_buyer_id AND deleted_at IS NULL;

  v_cards := v_cards || jsonb_build_array(
    app.metrics_v2_detail_card(
      'sales-and-demand-history',
      'unavailable',
      'Sales and demand history',
      'High-cardinality customer history is not stored daily in Metrics V2',
      upper(v_history),
      'unavailable',
      app.metrics_v2_empty_card_body('Unavailable', 'Customer history requires an on-open V2 read model; V1 buyer daily facts are intentionally not used.')
    ),
    app.metrics_v2_detail_card(
      'products-requested-repeatedly',
      'unavailable',
      'Products requested repeatedly',
      'Bounded product-repeat read model pending',
      '90D',
      'unavailable',
      app.metrics_v2_empty_card_body('Unavailable', 'No V2 product-repeat read model exists for this customer yet.')
    ),
    app.metrics_v2_detail_card(
      'what-this-customer-buys',
      'unavailable',
      'What this customer buys',
      'Contribution mix',
      '90D',
      'unavailable',
      app.metrics_v2_empty_card_body('Unavailable', 'No V2 customer mix read model exists yet.')
    ),
    app.metrics_v2_detail_card(
      'payment-behavior',
      'distribution',
      'Payment behavior',
      'Current receivables and credit posture',
      'NOW',
      CASE WHEN v_metrics.id IS NULL THEN 'unavailable' ELSE 'ready' END,
      jsonb_build_object(
        'items', CASE WHEN v_metrics.id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(
          jsonb_build_object('id', 'receivable', 'label', 'Receivable', 'value', v_metrics.receivable_amount),
          jsonb_build_object('id', 'overdue', 'label', 'Overdue', 'value', v_metrics.overdue_amount),
          jsonb_build_object('id', 'credit-available', 'label', 'Credit available', 'value', COALESCE(v_metrics.credit_available, 0))
        ) END,
        'emptyTitle', 'Payment behavior is unavailable',
        'emptyDescription', 'Metrics V2 buyer snapshot has not been computed for this customer.'
      )
    )
  );

  RETURN jsonb_build_object(
    'entity_family', 'customers',
    'entity_id', p_buyer_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object(
      'id', v_buyer.id,
      'title', v_buyer.business_name,
      'status_label', CASE WHEN v_buyer.is_active THEN 'Active' ELSE 'Inactive' END
    ),
    'kpi_grid', jsonb_build_array(
      jsonb_build_object('label', 'Invoiced sales 90D', 'value', COALESCE(v_metrics.invoice_value_90d, 0)),
      jsonb_build_object('label', 'Invoices 90D', 'value', COALESCE(v_metrics.invoice_count_90d, 0)),
      jsonb_build_object('label', 'Receivable', 'value', COALESCE(v_metrics.receivable_amount, 0)),
      jsonb_build_object('label', 'Overdue', 'value', COALESCE(v_metrics.overdue_amount, 0))
    ),
    'tab_badges', '{}'::jsonb,
    'performance_cards', v_cards
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_product_detail_v2(
  p_tenant_id uuid,
  p_tenant_product_id uuid,
  p_period text DEFAULT '90d',
  p_history_period text DEFAULT '12m',
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_history text;
  v_product app.tenant_products%ROWTYPE;
  v_metrics app.metrics_product_snapshot%ROWTYPE;
  v_location_items jsonb;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['90d']);
  v_history := app.metrics_v2_assert_detail_period(p_history_period, ARRAY['12m', 'ytd', '3m']);

  SELECT * INTO v_product
  FROM app.tenant_products
  WHERE tenant_id = p_tenant_id AND id = p_tenant_product_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_metrics
  FROM app.metrics_product_snapshot
  WHERE tenant_id = p_tenant_id AND tenant_product_id = p_tenant_product_id AND deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', mpl.location_id,
      'label', COALESCE(l.name, 'Location'),
      'value', mpl.available,
      'supporting', 'available units'
    )
    ORDER BY mpl.available DESC
  ), '[]'::jsonb)
  INTO v_location_items
  FROM (
    SELECT *
    FROM app.metrics_product_location_snapshot
    WHERE tenant_id = p_tenant_id
      AND tenant_product_id = p_tenant_product_id
      AND deleted_at IS NULL
    ORDER BY available DESC
    LIMIT 20
  ) mpl
  LEFT JOIN app.locations l ON l.id = mpl.location_id AND l.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'entity_family', 'products',
    'entity_id', p_tenant_product_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object('id', v_product.id, 'title', COALESCE(v_product.name_override, v_product.internal_sku), 'sku', v_product.internal_sku),
    'kpi_grid', jsonb_build_array(
      jsonb_build_object('label', 'Invoiced sales 90D', 'value', COALESCE(v_metrics.invoice_value_90d, 0)),
      jsonb_build_object('label', 'Units sold 90D', 'value', COALESCE(v_metrics.invoice_units_90d, 0)),
      jsonb_build_object('label', 'Available', 'value', COALESCE(v_metrics.available, 0)),
      jsonb_build_object('label', 'Days cover', 'value', v_metrics.days_cover)
    ),
    'tab_badges', '{}'::jsonb,
    'performance_cards', jsonb_build_array(
      app.metrics_v2_detail_card('sales-and-units-over-time', 'unavailable', 'Sales and units over time', 'No product-daily V2 history is materialized', upper(v_history), 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'Product daily V1 facts are not used.')),
      app.metrics_v2_detail_card('current-stock-by-warehouse', 'distribution', 'Current stock by warehouse', 'Current location stock from Metrics V2', 'NOW', 'ready', jsonb_build_object('items', v_location_items, 'emptyTitle', 'No location stock available')),
      app.metrics_v2_detail_card('customers-buying-this-product', 'unavailable', 'Customers buying this product', 'Bounded buyer ranking read model pending', '90D', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 product-buyer read model exists yet.')),
      app.metrics_v2_detail_card('actual-selling-prices', 'distribution', 'Actual selling prices', 'Current pricing posture', 'NOW', 'ready', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'base', 'label', 'Base price', 'value', v_product.base_selling_price)), 'emptyTitle', 'No pricing configured'))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_brand_detail_v2(
  p_tenant_id uuid,
  p_tenant_brand_id uuid,
  p_period text DEFAULT '90d',
  p_history_period text DEFAULT '12m',
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_history text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit_top, 20), 1), 20);
  v_brand app.tenant_brands%ROWTYPE;
  v_sales numeric := 0;
  v_units numeric := 0;
  v_products bigint := 0;
  v_product_items jsonb;
  v_inventory_items jsonb;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['90d']);
  v_history := app.metrics_v2_assert_detail_period(p_history_period, ARRAY['12m', 'ytd', '3m']);

  SELECT * INTO v_brand FROM app.tenant_brands WHERE tenant_id = p_tenant_id AND id = p_tenant_brand_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'brand not found' USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(SUM(mps.invoice_value_90d), 0), COALESCE(SUM(mps.invoice_units_90d), 0), COUNT(*)
  INTO v_sales, v_units, v_products
  FROM app.metrics_product_snapshot mps
  JOIN app.tenant_products tp ON tp.id = mps.tenant_product_id AND tp.tenant_id = p_tenant_id
  WHERE mps.tenant_id = p_tenant_id AND tp.tenant_brand_id = p_tenant_brand_id AND mps.deleted_at IS NULL AND tp.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', product_id, 'label', label, 'value', value, 'supporting', supporting) ORDER BY sort_value DESC), '[]'::jsonb)
  INTO v_product_items
  FROM (
    SELECT tp.id AS product_id, COALESCE(tp.name_override, tp.internal_sku) AS label, mps.invoice_value_90d AS value, mps.invoice_units_90d || ' units' AS supporting, mps.invoice_value_90d AS sort_value
    FROM app.metrics_product_snapshot mps
    JOIN app.tenant_products tp ON tp.id = mps.tenant_product_id AND tp.tenant_id = p_tenant_id
    WHERE mps.tenant_id = p_tenant_id AND tp.tenant_brand_id = p_tenant_brand_id AND mps.deleted_at IS NULL AND tp.deleted_at IS NULL
    ORDER BY mps.invoice_value_90d DESC
    LIMIT v_limit
  ) ranked;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', location_id, 'label', label, 'value', value, 'supporting', supporting) ORDER BY value DESC), '[]'::jsonb)
  INTO v_inventory_items
  FROM (
    SELECT mpl.location_id, COALESCE(l.name, 'Location') AS label, SUM(mpl.available) AS value, COUNT(DISTINCT mpl.tenant_product_id) || ' products' AS supporting
    FROM app.metrics_product_location_snapshot mpl
    JOIN app.tenant_products tp ON tp.id = mpl.tenant_product_id AND tp.tenant_id = p_tenant_id
    LEFT JOIN app.locations l ON l.id = mpl.location_id AND l.tenant_id = p_tenant_id
    WHERE mpl.tenant_id = p_tenant_id AND tp.tenant_brand_id = p_tenant_brand_id AND mpl.deleted_at IS NULL AND tp.deleted_at IS NULL
    GROUP BY mpl.location_id, l.name
    ORDER BY SUM(mpl.available) DESC
    LIMIT v_limit
  ) inv;

  RETURN jsonb_build_object(
    'entity_family', 'brands',
    'entity_id', p_tenant_brand_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object('id', v_brand.id, 'title', COALESCE(v_brand.display_name_override, 'Brand')),
    'kpi_grid', jsonb_build_array(
      jsonb_build_object('label', 'Invoiced sales 90D', 'value', v_sales),
      jsonb_build_object('label', 'Units 90D', 'value', v_units),
      jsonb_build_object('label', 'Products', 'value', v_products)
    ),
    'tab_badges', '{}'::jsonb,
    'performance_cards', jsonb_build_array(
      app.metrics_v2_detail_card('sales-over-time', 'unavailable', 'Sales over time', 'No brand-daily V2 history is materialized', upper(v_history), 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'Brand trend does not read V1 daily facts.')),
      app.metrics_v2_detail_card('product-contribution', 'ranked_list', 'Product contribution', 'Products by invoiced sales', '90D', 'ready', jsonb_build_object('items', v_product_items, 'emptyTitle', 'No product contribution yet')),
      app.metrics_v2_detail_card('customers-buying-the-brand', 'unavailable', 'Customers buying the brand', 'Bounded buyer ranking read model pending', '90D', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 brand-buyer read model exists yet.')),
      app.metrics_v2_detail_card('current-inventory-by-warehouse', 'distribution', 'Current inventory by warehouse', 'Current stock distribution', 'NOW', 'ready', jsonb_build_object('items', v_inventory_items, 'emptyTitle', 'No warehouse inventory available'))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_category_detail_v2(
  p_tenant_id uuid,
  p_tenant_category_id uuid,
  p_period text DEFAULT '90d',
  p_history_period text DEFAULT '12m',
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_history text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit_top, 20), 1), 20);
  v_category app.tenant_categories%ROWTYPE;
  v_sales numeric := 0;
  v_units numeric := 0;
  v_brand_items jsonb;
  v_product_items jsonb;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['90d']);
  v_history := app.metrics_v2_assert_detail_period(p_history_period, ARRAY['12m', 'ytd', '3m']);

  SELECT * INTO v_category FROM app.tenant_categories WHERE tenant_id = p_tenant_id AND id = p_tenant_category_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'category not found' USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(SUM(mps.invoice_value_90d), 0), COALESCE(SUM(mps.invoice_units_90d), 0)
  INTO v_sales, v_units
  FROM app.metrics_product_snapshot mps
  JOIN app.tenant_products tp ON tp.id = mps.tenant_product_id AND tp.tenant_id = p_tenant_id
  WHERE mps.tenant_id = p_tenant_id AND tp.tenant_category_id = p_tenant_category_id AND mps.deleted_at IS NULL AND tp.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', brand_id, 'label', label, 'value', value, 'supporting', supporting) ORDER BY value DESC), '[]'::jsonb)
  INTO v_brand_items
  FROM (
    SELECT COALESCE(tp.tenant_brand_id, '00000000-0000-0000-0000-000000000000'::uuid) AS brand_id,
           COALESCE(tb.display_name_override, 'Unbranded') AS label,
           SUM(mps.invoice_value_90d) AS value,
           SUM(mps.invoice_units_90d) || ' units' AS supporting
    FROM app.metrics_product_snapshot mps
    JOIN app.tenant_products tp ON tp.id = mps.tenant_product_id AND tp.tenant_id = p_tenant_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id AND tb.tenant_id = p_tenant_id
    WHERE mps.tenant_id = p_tenant_id AND tp.tenant_category_id = p_tenant_category_id AND mps.deleted_at IS NULL AND tp.deleted_at IS NULL
    GROUP BY tp.tenant_brand_id, tb.display_name_override
    ORDER BY SUM(mps.invoice_value_90d) DESC
    LIMIT v_limit
  ) brands;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', product_id, 'label', label, 'value', value, 'supporting', supporting) ORDER BY value DESC), '[]'::jsonb)
  INTO v_product_items
  FROM (
    SELECT tp.id AS product_id, COALESCE(tp.name_override, tp.internal_sku) AS label, mps.invoice_value_90d AS value,
           CASE WHEN mps.out_of_stock THEN 'Out of stock' WHEN mps.low_stock THEN 'Low stock' ELSE 'On hand ' || mps.available END AS supporting
    FROM app.metrics_product_snapshot mps
    JOIN app.tenant_products tp ON tp.id = mps.tenant_product_id AND tp.tenant_id = p_tenant_id
    WHERE mps.tenant_id = p_tenant_id AND tp.tenant_category_id = p_tenant_category_id AND mps.deleted_at IS NULL AND tp.deleted_at IS NULL
    ORDER BY mps.out_of_stock DESC, mps.low_stock DESC, mps.invoice_value_90d DESC
    LIMIT v_limit
  ) products;

  RETURN jsonb_build_object(
    'entity_family', 'categories',
    'entity_id', p_tenant_category_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object('id', v_category.id, 'title', v_category.name),
    'kpi_grid', jsonb_build_array(
      jsonb_build_object('label', 'Invoiced sales 90D', 'value', v_sales),
      jsonb_build_object('label', 'Units 90D', 'value', v_units)
    ),
    'tab_badges', '{}'::jsonb,
    'performance_cards', jsonb_build_array(
      app.metrics_v2_detail_card('sales-over-time', 'unavailable', 'Sales over time', 'No category-daily V2 history is materialized', upper(v_history), 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'Category trend does not read V1 daily facts.')),
      app.metrics_v2_detail_card('brand-contribution', 'ranked_list', 'Brand contribution', 'Brands by invoiced sales', '90D', 'ready', jsonb_build_object('items', v_brand_items, 'emptyTitle', 'No brand contribution yet')),
      app.metrics_v2_detail_card('product-action-list', 'ranked_list', 'Product action list', 'Stock and contribution ranking', 'NOW + 90D', 'ready', jsonb_build_object('items', v_product_items, 'emptyTitle', 'No product actions right now'))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_location_detail_v2(
  p_tenant_id uuid,
  p_location_id uuid,
  p_period text DEFAULT '90d',
  p_history_period text DEFAULT '12m',
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_history text;
  v_location app.locations%ROWTYPE;
  v_metrics app.metrics_location_snapshot%ROWTYPE;
  v_daily jsonb;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['90d']);
  v_history := app.metrics_v2_assert_detail_period(p_history_period, ARRAY['12m', 'ytd', '3m']);

  SELECT * INTO v_location FROM app.locations WHERE tenant_id = p_tenant_id AND id = p_location_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'location not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_metrics FROM app.metrics_location_snapshot WHERE tenant_id = p_tenant_id AND location_id = p_location_id AND deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', month_key, 'value', invoice_value) ORDER BY month_key), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT to_char(date_trunc('month', day), 'YYYY-MM') AS month_key, SUM(invoice_value) AS invoice_value
    FROM app.metrics_location_daily
    WHERE tenant_id = p_tenant_id AND location_id = p_location_id AND deleted_at IS NULL AND day >= (p_as_of::date - INTERVAL '12 months')
    GROUP BY 1
    ORDER BY 1
  ) months;

  RETURN jsonb_build_object(
    'entity_family', 'locations',
    'entity_id', p_location_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object('id', v_location.id, 'title', v_location.name),
    'kpi_grid', jsonb_build_array(
      jsonb_build_object('label', 'Invoiced sales 90D', 'value', COALESCE(v_metrics.invoice_value_90d, 0)),
      jsonb_build_object('label', 'Purchasing customers 90D', 'value', COALESCE(v_metrics.purchasing_buyers_90d, 0)),
      jsonb_build_object('label', 'Receivable', 'value', COALESCE(v_metrics.receivable_amount, 0)),
      jsonb_build_object('label', 'Overdue', 'value', COALESCE(v_metrics.overdue_amount, 0))
    ),
    'tab_badges', '{}'::jsonb,
    'performance_cards', jsonb_build_array(
      app.metrics_v2_detail_card('sales-over-time', 'trend', 'Sales over time', 'Invoiced sales history', upper(v_history), 'ready', jsonb_build_object('points', v_daily, 'emptyTitle', 'No sales over time yet')),
      app.metrics_v2_detail_card('order-execution-workload', 'distribution', 'Order execution workload', 'Current workload from Metrics V2 location snapshot', 'NOW', 'ready', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'open-orders', 'label', 'Open orders', 'value', COALESCE(v_metrics.open_order_count, 0)), jsonb_build_object('id', 'open-estimates', 'label', 'Open estimates', 'value', COALESCE(v_metrics.open_estimate_count, 0))), 'emptyTitle', 'No workload')),
      app.metrics_v2_detail_card('inventory-at-linked-warehouses', 'distribution', 'Inventory at linked warehouses', 'Current linked stock posture', 'NOW', 'ready', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'stocked', 'label', 'Stocked products', 'value', COALESCE(v_metrics.stocked_product_count, 0)), jsonb_build_object('id', 'low-stock', 'label', 'Low stock', 'value', COALESCE(v_metrics.low_stock_product_count, 0)), jsonb_build_object('id', 'out-of-stock', 'label', 'Out of stock', 'value', COALESCE(v_metrics.out_of_stock_product_count, 0))), 'emptyTitle', 'No inventory posture'))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_warehouse_detail_v2(
  p_tenant_id uuid,
  p_warehouse_id uuid,
  p_period text DEFAULT 'now_90d',
  p_history_period text DEFAULT NULL,
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_warehouse app.warehouses%ROWTYPE;
  v_setup app.metrics_tenant_setup_snapshot%ROWTYPE;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['now_90d']);
  SELECT * INTO v_warehouse FROM app.warehouses WHERE tenant_id = p_tenant_id AND id = p_warehouse_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'warehouse not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_setup FROM app.metrics_tenant_setup_snapshot WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'entity_family', 'warehouses',
    'entity_id', p_warehouse_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object('id', v_warehouse.id, 'title', v_warehouse.name),
    'kpi_grid', jsonb_build_array(jsonb_build_object('label', 'Active warehouses', 'value', COALESCE(v_setup.active_warehouse_count, 0))),
    'tab_badges', '{}'::jsonb,
    'performance_cards', jsonb_build_array(
      app.metrics_v2_detail_card('current-inventory-posture', 'distribution', 'Current inventory posture', 'Warehouse-specific stock read model pending', 'NOW', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 warehouse stock snapshot exists yet.')),
      app.metrics_v2_detail_card('stock-risk-product-list', 'unavailable', 'Stock-risk product list', 'Warehouse-specific V2 stock-risk model pending', 'NOW + 90D', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 warehouse product-risk read model exists yet.')),
      app.metrics_v2_detail_card('availability-by-brand-category', 'unavailable', 'Availability by brand/category', 'Warehouse-specific V2 mix model pending', 'NOW', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 warehouse availability mix exists yet.'))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_cohort_detail_v2(
  p_tenant_id uuid,
  p_cohort_id uuid,
  p_period text DEFAULT '90d',
  p_history_period text DEFAULT NULL,
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_cohort app.cohorts%ROWTYPE;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['90d']);
  SELECT * INTO v_cohort FROM app.cohorts WHERE tenant_id = p_tenant_id AND id = p_cohort_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'cohort not found' USING ERRCODE = 'P0002'; END IF;

  RETURN jsonb_build_object(
    'entity_family', 'cohorts',
    'entity_id', p_cohort_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object('id', v_cohort.id, 'title', v_cohort.name),
    'kpi_grid', jsonb_build_array(jsonb_build_object('label', 'Current members', 'value', COALESCE(v_cohort.cached_member_count, 0))),
    'tab_badges', '{}'::jsonb,
    'performance_cards', jsonb_build_array(
      app.metrics_v2_detail_card('member-activity', 'distribution', 'Member activity', 'Current membership plus 90D facts', '90D', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 cohort member activity read model exists yet.')),
      app.metrics_v2_detail_card('products-and-brands-members-buy', 'mix', 'Products and brands members buy', 'Composition view', '90D', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 cohort mix read model exists yet.')),
      app.metrics_v2_detail_card('member-opportunity-list', 'ranked_list', 'Member opportunity list', 'Ranked opportunities', '90D', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 cohort opportunity read model exists yet.'))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_pricelist_detail_v2(
  p_tenant_id uuid,
  p_price_list_id uuid,
  p_period text DEFAULT 'now',
  p_history_period text DEFAULT NULL,
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_price_list app.price_lists%ROWTYPE;
  v_setup app.metrics_tenant_setup_snapshot%ROWTYPE;
  v_items_count bigint := 0;
  v_assignments_count bigint := 0;
  v_discounted bigint := 0;
  v_at_base bigint := 0;
  v_above_base bigint := 0;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['now']);
  SELECT * INTO v_price_list FROM app.price_lists WHERE tenant_id = p_tenant_id AND id = p_price_list_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'price list not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_setup FROM app.metrics_tenant_setup_snapshot WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE pli.price < COALESCE(tp.base_selling_price, pli.price)),
         COUNT(*) FILTER (WHERE ABS(pli.price - COALESCE(tp.base_selling_price, pli.price)) < 0.0001),
         COUNT(*) FILTER (WHERE pli.price > COALESCE(tp.base_selling_price, pli.price))
  INTO v_items_count, v_discounted, v_at_base, v_above_base
  FROM app.price_list_items pli
  LEFT JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id AND tp.tenant_id = p_tenant_id
  WHERE pli.price_list_id = p_price_list_id AND pli.deleted_at IS NULL;

  SELECT COUNT(*) INTO v_assignments_count
  FROM app.price_list_assignments
  WHERE price_list_id = p_price_list_id AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'entity_family', 'pricelists',
    'entity_id', p_price_list_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object('id', v_price_list.id, 'title', v_price_list.name),
    'kpi_grid', jsonb_build_array(
      jsonb_build_object('label', 'Products covered', 'value', v_items_count),
      jsonb_build_object('label', 'Assignments', 'value', v_assignments_count)
    ),
    'tab_badges', '{}'::jsonb,
    'performance_cards', jsonb_build_array(
      app.metrics_v2_detail_card('who-receives-this-pricing', 'distribution', 'Who receives this pricing', 'Assignment count', 'NOW', 'ready', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'assignments', 'label', 'Assigned recipients', 'value', v_assignments_count)), 'emptyTitle', 'No assignments yet')),
      app.metrics_v2_detail_card('product-coverage-gaps', 'distribution', 'Product coverage gaps', 'Active tenant products versus covered products', 'NOW', 'ready', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'covered', 'label', 'Covered', 'value', v_items_count), jsonb_build_object('id', 'uncovered', 'label', 'Uncovered', 'value', GREATEST(COALESCE(v_setup.active_product_count, 0) - v_items_count, 0))), 'emptyTitle', 'No coverage data')),
      app.metrics_v2_detail_card('discount-bands-and-price-checks', 'distribution', 'Discount bands and price checks', 'Current item pricing posture', 'NOW', 'ready', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'discounted', 'label', 'Discounted vs base', 'value', v_discounted), jsonb_build_object('id', 'at-base', 'label', 'At base price', 'value', v_at_base), jsonb_build_object('id', 'above-base', 'label', 'Above base', 'value', v_above_base)), 'emptyTitle', 'No priced items yet'))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_campaign_detail_v2(
  p_tenant_id uuid,
  p_campaign_id uuid,
  p_period text DEFAULT 'lifetime',
  p_history_period text DEFAULT NULL,
  p_limit_top integer DEFAULT 20,
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period text;
  v_campaign app.campaigns%ROWTYPE;
BEGIN
  v_period := app.metrics_v2_assert_detail_period(p_period, ARRAY['lifetime']);
  SELECT * INTO v_campaign FROM app.campaigns WHERE tenant_id = p_tenant_id AND id = p_campaign_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign not found' USING ERRCODE = 'P0002'; END IF;

  RETURN jsonb_build_object(
    'entity_family', 'campaigns',
    'entity_id', p_campaign_id,
    'as_of', p_as_of,
    'default_period', v_period,
    'header', jsonb_build_object('id', v_campaign.id, 'title', v_campaign.name),
    'kpi_grid', jsonb_build_array(jsonb_build_object('label', 'Status', 'value', v_campaign.status)),
    'tab_badges', '{}'::jsonb,
    'performance_cards', jsonb_build_array(
      app.metrics_v2_detail_card('timeline', 'unavailable', 'Timeline', 'Campaign lifetime timeline read model pending', 'LIFETIME', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 campaign timeline read model exists yet.')),
      app.metrics_v2_detail_card('lifetime-funnel', 'distribution', 'Funnel', 'Campaign lifetime funnel read model pending', 'LIFETIME', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 campaign funnel read model exists yet.')),
      app.metrics_v2_detail_card('recipient-outcomes', 'ranked_list', 'Recipient outcomes', 'Campaign recipient ranking read model pending', 'LIFETIME', 'unavailable', app.metrics_v2_empty_card_body('Unavailable', 'No V2 campaign recipient read model exists yet.'))
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app.get_seller_customer_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_product_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_brand_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_category_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_location_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_warehouse_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_cohort_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_pricelist_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_campaign_detail_v2(uuid, uuid, text, text, integer, timestamptz) TO authenticated, service_role;
