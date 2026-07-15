
# Motivation
I've not yet run aggregations on my db. Previous runs choked the db (especially due to large kpi tables and inefficient aggregations). It is a good opportunity to clean up some of the existing scripts that populate those tables. That's the reason I started this activity. I want to do the following.

# General Guardrails
1. Remove trends, aggregations, and comparisons and from all landing page tables (also from sort options)
2. Limit the scope of KPIs to operational KPIs only
3. Replace GMV with `Entity value` (E.g. Orders value, Estimates value, Invoiced sales) to avoid GMV meaning
4. Remove Performance tab from as many details pages as possible (keep it operational, can add later)
5. Remove Top risers from all callouts and find alternate callouts that could help

# Screen cleanups

## Dashboard


## Estimates

### Landing Page
1. KPIs - Total count in periodno changes, verify
2. Callouts
- Needs followup - Move estimate_value to subtext & show status
- Ready to convert - ? Don't know logic
- Expiring soon - ? Why no list?
3. Table - no changes
4. KPIs are not refreshing on period change, needs debugging

### Details Page
1. Remove over limit label on top right above summary
2. What is the header components? Fix that.

## Sales Orders

### Landing Page
1. KPIs - no changes, verify
2. Callouts
- Needs action - ? Don't know logic
- Biggest tickets - remove city target
- In motion - ? Don't know logic
3. Table - No change
4. KPIs are not refreshing on period change, needs debugging

### Details Page
1. Remove over limit label
2. Check header components

## Invoices

### Landing Page
1. KPIs - no changes, verify
2. Callouts
- Needs attention - Keep
- Top spenders - Keep
- Top Risers - Keep
3. Table - no change

### Details Page
1. Check limit label
2. Check header components

## Customers

### Landing Page
1. KPIs - Fix logics for 4 KPIs (review if trend is needed)
2. Callouts
- Needs a call - no change
- Top spenders - fix logic to get list
- Top risers - fix logic to get list -> replcae iwth what?
3. Table - Keep Spend MTD, Outstanding Due, Last Order, Status, Remove Growth

### Details
1. KPIs - no change (remove trend in first KPI)
2. Performance tab - derive from invoices - top SKUs, trend, brand-mix, credit & ops
3. Review header components

## Products
1. KPIs - 


## Campaigns
1. KPIs - remove trend from last month; Review Conversions attributed KPI
2. Callouts - Review separately
3. Table - check TechWave
4. Details - check TechWave


## Customer Groups
1. KPIs - Update count/coverage KPI; Update GMV calculation (Remove trend); Avg conversion; Uncategorized buyers copy
2. Callouts - review TechWave
3. Table -review techwave
4. Details - review techwave

## Pricelists
1. 