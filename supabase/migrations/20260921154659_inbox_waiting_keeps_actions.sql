-- Snoozed (waiting) inbox entries kept only reopen/add_note/view_*, so 'Remind later' made
-- Convert/Reply/etc. disappear. Snoozed entries now keep their open-state actions.
CREATE OR REPLACE FUNCTION app.entry_allowed_actions(
  p_entry_type text,
  p_status text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = app, public
AS $$
BEGIN
  IF p_status = 'resolved' THEN
    CASE p_entry_type
      WHEN 'new_enquiry' THEN
        RETURN jsonb_build_array('reopen', 'view_enquiry', 'view_buyer');
      WHEN 'new_order_confirmation' THEN
        RETURN jsonb_build_array('reopen', 'view_order', 'view_buyer');
      WHEN 'order_dispatch_needed' THEN
        RETURN jsonb_build_array('reopen', 'view_order', 'view_buyer');
      WHEN 'invoice_due' THEN
        RETURN jsonb_build_array('reopen', 'view_invoice', 'view_buyer');
      WHEN 'invoice_overdue' THEN
        RETURN jsonb_build_array('reopen', 'view_invoice', 'view_buyer');
      ELSE
        RETURN jsonb_build_array('reopen', 'view_details', 'view_buyer');
    END CASE;
  END IF;

  IF p_status = 'waiting' THEN
    -- Approval entries in 'waiting' (post request_more_info) must be reopened before
    -- approve/decline can run again -- see apply_entry_action.
    IF p_entry_type IN ('business_approval', 'new_user_login') THEN
      RETURN jsonb_build_array('reopen', 'add_note', 'view_details', 'view_buyer');
    END IF;
    -- A snoozed (remind_later) entry is still open work: keep every open-state action,
    -- including remind_later so it can be snoozed again.
    RETURN app.entry_allowed_actions(p_entry_type, 'new', p_metadata);
  END IF;

  CASE p_entry_type
    WHEN 'business_approval' THEN
      RETURN jsonb_build_array('approve', 'request_more_info', 'decline', 'view_details', 'view_buyer', 'add_note');
    WHEN 'new_user_login' THEN
      RETURN jsonb_build_array('approve', 'request_more_info', 'decline', 'view_details', 'view_buyer', 'add_note', 'view_activity', 'ignore');
    WHEN 'new_enquiry' THEN
      RETURN jsonb_build_array('reply_quote', 'send', 'convert', 'contact_buyer', 'view_enquiry', 'view_buyer', 'view_buyer_history', 'mark_converted_manually', 'remind_later', 'add_note');
    WHEN 'new_order_confirmation' THEN
      RETURN jsonb_build_array('accept_order', 'contact_buyer', 'reject', 'view_order', 'view_buyer', 'add_note');
    WHEN 'order_dispatch_needed' THEN
      RETURN jsonb_build_array('mark_dispatched', 'view_order', 'view_buyer', 'remind_later', 'add_note');
    WHEN 'invoice_due' THEN
      RETURN jsonb_build_array('send_reminder', 'view_invoice', 'view_buyer', 'remind_later', 'add_note');
    WHEN 'invoice_overdue' THEN
      RETURN jsonb_build_array('send_reminder', 'log_call', 'view_invoice', 'view_buyer', 'remind_later', 'add_note');
    WHEN 'credit_limit_breach' THEN
      RETURN jsonb_build_array('send_reminder', 'adjust_limit', 'view_account', 'view_details', 'view_buyer', 'remind_later', 'add_note');
    ELSE
      RETURN jsonb_build_array('view_details', 'view_buyer', 'add_note');
  END CASE;
END;
$$;
