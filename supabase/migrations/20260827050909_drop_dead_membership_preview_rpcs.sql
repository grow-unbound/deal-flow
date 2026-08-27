-- Dead-code cleanup: app.preview_membership_count and its two dispatch targets
-- (preview_buyer_membership_count / preview_product_membership_count) had exactly one
-- caller each in a chain: app/api/membership/preview/route.ts -> preview_membership_count ->
-- preview_{buyer,product}_membership_count. That route's only frontend consumer was
-- MembershipFilterPanel.tsx (via useMembershipPreviewCount), which has just been removed --
-- all 4 Details-tab rule editors and the 3 Add/Edit form sheets now use
-- AutomaticBuyerMembershipPanel/AutomaticProductMembershipPanel instead, whose live count
-- reuses the picker RPCs (search_cohort_composer_buyers/search_picker_products) directly.
-- No remaining caller anywhere in the app for any of these 3 functions.

DROP FUNCTION IF EXISTS app.preview_membership_count(uuid, text, jsonb);
DROP FUNCTION IF EXISTS app.preview_buyer_membership_count(uuid, jsonb);
DROP FUNCTION IF EXISTS app.preview_product_membership_count(uuid, jsonb);
