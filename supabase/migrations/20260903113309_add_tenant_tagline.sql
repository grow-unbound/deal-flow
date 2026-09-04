-- Short storefront tagline for tab titles and PWA description (distinct from business_name).
ALTER TABLE app.tenants ADD COLUMN IF NOT EXISTS tagline text;
