export type Database = {
  auth: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          email_confirmed_at: string | null;
          phone: string | null;
          phone_confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          phone?: string;
        };
        Update: {
          email?: string;
          phone?: string;
        };
      };
    };
  };
  catalog: {
    Tables: {
      integration_types: {
        Row: {
          id: string;
          display_name: string;
          description: string | null;
          logo_url: string | null;
          auth_schema: Record<string, unknown>;
          capabilities: Record<string, unknown>;
          connectivity_mode: 'cloud' | 'local';
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id: string;
          display_name: string;
          description?: string | null;
          logo_url?: string | null;
          auth_schema?: Record<string, unknown>;
          capabilities?: Record<string, unknown>;
          connectivity_mode?: 'cloud' | 'local';
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database['catalog']['Tables']['integration_types']['Insert']>;
      };
      brands: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          description: string | null;
          origin_tenant_id: string | null;
          is_public: boolean;
          external_ref: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string;
        };
        Insert: Omit<Database['catalog']['Tables']['brands']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['catalog']['Tables']['brands']['Insert']>;
      };
      categories: {
        Row: {
          id: string;
          name: string;
          parent_id: string | null;
          slug: string;
          image_url: string | null;
          is_public: boolean;
          external_ref: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string;
        };
        Insert: Omit<Database['catalog']['Tables']['categories']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['catalog']['Tables']['categories']['Insert']>;
      };
      products: {
        Row: {
          id: string;
          brand_id: string;
          category_id: string | null;
          master_sku: string;
          name: string;
          description: string | null;
          default_uom: string | null;
          pack_size: number | null;
          hsn_code: string | null;
          gst_rate: number | null;
          attributes: Record<string, any>;
          image_urls: string[];
          is_public: boolean;
          external_ref: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string;
        };
        Insert: Omit<Database['catalog']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['catalog']['Tables']['products']['Insert']>;
      };
    };
  };
  app: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          slug: string;
          business_name: string;
          gstin: string | null;
          primary_state: string | null;
          subdomain: string | null;
          plan: string;
          settings: Record<string, any>;
          whatsapp_credits_balance: number;
          whatsapp_credits_purchased: number;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string;
        };
        Insert: Omit<
          Database['app']['Tables']['tenants']['Row'],
          'id' | 'created_at' | 'updated_at' | 'whatsapp_credits_balance' | 'whatsapp_credits_purchased'
        > &
          Partial<Pick<Database['app']['Tables']['tenants']['Row'], 'whatsapp_credits_balance' | 'whatsapp_credits_purchased'>>;
        Update: Partial<Database['app']['Tables']['tenants']['Insert']>;
      };
      tenant_settings: {
        Row: {
          tenant_id: string;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          tenant_id: string;
          settings?: Record<string, unknown>;
          updated_by?: string | null;
        };
        Update: {
          settings?: Record<string, unknown>;
          updated_by?: string | null;
        };
      };
      tenant_integrations: {
        Row: {
          id: string;
          tenant_id: string;
          integration_type_id: string;
          status: 'pending_setup' | 'connected' | 'syncing' | 'sync_failed' | 'disconnected';
          vault_secret_id: string | null;
          config: Record<string, unknown>;
          last_health_check_at: string | null;
          health_status: 'ok' | 'expired' | 'invalid' | null;
          connected_at: string | null;
          connected_by: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          external_ref: string | null;
        };
        Insert: {
          tenant_id: string;
          integration_type_id: string;
          status?: 'pending_setup' | 'connected' | 'syncing' | 'sync_failed' | 'disconnected';
          vault_secret_id?: string | null;
          config?: Record<string, unknown>;
          last_health_check_at?: string | null;
          health_status?: 'ok' | 'expired' | 'invalid' | null;
          connected_at?: string | null;
          connected_by?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          external_ref?: string | null;
        };
        Update: Partial<Database['app']['Tables']['tenant_integrations']['Insert']>;
      };
      integration_sync_jobs: {
        Row: {
          id: string;
          tenant_id: string;
          tenant_integration_id: string;
          job_type: 'initial_reference' | 'initial_transactional' | 'incremental' | 'manual';
          status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
          progress: Record<string, unknown>;
          error_log: Record<string, unknown> | null;
          summary: Record<string, unknown> | null;
          started_at: string | null;
          completed_at: string | null;
          triggered_by: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          external_ref: string | null;
        };
        Insert: {
          tenant_id: string;
          tenant_integration_id: string;
          job_type: 'initial_reference' | 'initial_transactional' | 'incremental' | 'manual';
          status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
          progress?: Record<string, unknown>;
          error_log?: Record<string, unknown> | null;
          summary?: Record<string, unknown> | null;
          started_at?: string | null;
          completed_at?: string | null;
          triggered_by?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          external_ref?: string | null;
        };
        Update: Partial<Database['app']['Tables']['integration_sync_jobs']['Insert']>;
      };
      integration_entity_map: {
        Row: {
          id: string;
          tenant_id: string;
          tenant_integration_id: string;
          entity_type: string;
          external_id: string;
          internal_id: string;
          last_synced_at: string | null;
          sync_status: 'synced' | 'pending_push' | 'conflict' | 'error' | null;
          external_hash: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          external_ref: string | null;
        };
        Insert: {
          tenant_id: string;
          tenant_integration_id: string;
          entity_type: string;
          external_id: string;
          internal_id: string;
          last_synced_at?: string | null;
          sync_status?: 'synced' | 'pending_push' | 'conflict' | 'error' | null;
          external_hash?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          external_ref?: string | null;
        };
        Update: Partial<Database['app']['Tables']['integration_entity_map']['Insert']>;
      };
      integration_webhooks: {
        Row: {
          id: string;
          tenant_id: string;
          tenant_integration_id: string;
          endpoint_token: string;
          event_types: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          external_ref: string | null;
        };
        Insert: {
          tenant_id: string;
          tenant_integration_id: string;
          endpoint_token?: string;
          event_types: string[];
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          external_ref?: string | null;
        };
        Update: Partial<Database['app']['Tables']['integration_webhooks']['Insert']>;
      };
      integration_data_flows: {
        Row: {
          id: string;
          tenant_id: string;
          tenant_integration_id: string;
          entity_type: string;
          direction: 'inbound' | 'outbound' | 'bidirectional';
          trigger_type: 'webhook' | 'scheduled' | 'event';
          schedule: string | null;
          webhook_id: string | null;
          field_mappings: Record<string, unknown>;
          filters: Record<string, unknown>;
          is_active: boolean;
          last_run_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          external_ref: string | null;
        };
        Insert: {
          tenant_id: string;
          tenant_integration_id: string;
          entity_type: string;
          direction: 'inbound' | 'outbound' | 'bidirectional';
          trigger_type: 'webhook' | 'scheduled' | 'event';
          schedule?: string | null;
          webhook_id?: string | null;
          field_mappings?: Record<string, unknown>;
          filters?: Record<string, unknown>;
          is_active?: boolean;
          last_run_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          external_ref?: string | null;
        };
        Update: Partial<Database['app']['Tables']['integration_data_flows']['Insert']>;
      };
      tenant_users: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          role: 'seller_admin' | 'seller_assistant';
          is_active: boolean;
          invited_at: string | null;
          joined_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string;
        };
        Insert: Omit<Database['app']['Tables']['tenant_users']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['app']['Tables']['tenant_users']['Insert']>;
      };
      buyers: {
        Row: {
          id: string;
          tenant_id: string;
          business_name: string;
          contact_name: string | null;
          phone: string | null;
          email: string | null;
          gstin: string | null;
          geography: Record<string, any> | null;
          credit_limit: number;
          payment_terms_days: number;
          tier: string | null;
          external_ref: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string;
        };
        Insert: Omit<Database['app']['Tables']['buyers']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['app']['Tables']['buyers']['Insert']>;
      };
      orders: {
        Row: {
          id: string;
          tenant_id: string;
          buyer_id: string;
          placed_by: string;
          order_number: string;
          status: 'draft' | 'received' | 'confirmed' | 'partially_dispatched' | 'dispatched' | 'delivered' | 'cancelled';
          source: 'buyer_app' | 'cockpit_manual' | 'csv_import';
          catalog_id: string | null;
          subtotal: number;
          tax_amount: number;
          total_amount: number;
          currency: string;
          notes: string | null;
          placed_at: string;
          external_ref: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string;
        };
        Insert: Omit<Database['app']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['app']['Tables']['orders']['Insert']>;
      };
    };
  };
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      get_user_workspace: {
        Args: { p_user_id: string };
        Returns: Array<{
          workspace_type: 'seller' | 'buyer';
          role: string;
          tenant_id: string | null;
          tenant_slug: string | null;
          tenant_name: string | null;
          buyer_id: string | null;
        }>;
      };
      custom_access_token_hook: {
        Args: { event: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      upsert_tenant_integration_secret: {
        Args: {
          p_tenant_integration_id: string;
          p_actor_user_id: string;
          p_secret: Record<string, unknown>;
          p_secret_name?: string | null;
        };
        Returns: string;
      };
      get_tenant_integration_secret: {
        Args: {
          p_tenant_integration_id: string;
          p_actor_user_id: string;
        };
        Returns: Record<string, unknown> | null;
      };
      get_tenant_integration_runtime_secret: {
        Args: {
          p_tenant_integration_id: string;
          p_expected_integration_type_id: string;
        };
        Returns: Record<string, unknown> | null;
      };
      delete_tenant_integration_secret: {
        Args: {
          p_tenant_integration_id: string;
          p_actor_user_id: string;
        };
        Returns: void;
      };
    };
  };
};
