-- Enable REPLICA IDENTITY FULL so UPDATE events include old row data
ALTER TABLE app.campaigns REPLICA IDENTITY FULL;
ALTER TABLE app.estimates           REPLICA IDENTITY FULL;
ALTER TABLE app.orders              REPLICA IDENTITY FULL;
ALTER TABLE app.invoices            REPLICA IDENTITY FULL;

-- Add tables to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE app.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE app.estimates;
ALTER PUBLICATION supabase_realtime ADD TABLE app.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE app.invoices;
