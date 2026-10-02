export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: boolean
          order_counter: number
        }
        Insert: {
          id?: boolean
          order_counter?: number
        }
        Update: {
          id?: boolean
          order_counter?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          created_at: string
          description: string | null
          end_date: string
          id: string
          name: string
          reopened: boolean
          start_date: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          name: string
          reopened?: boolean
          start_date: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          reopened?: boolean
          start_date?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string
          id: string
          label: string
          requires_series: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          requires_series?: boolean
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          requires_series?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      form_fields: {
        Row: {
          campaign_id: string
          created_at: string
          field_type: string
          id: string
          is_active: boolean
          label: string
          options: Json
          program_id: string | null
          required: boolean
          sort_order: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          field_type: string
          id?: string
          is_active?: boolean
          label: string
          options?: Json
          program_id?: string | null
          required?: boolean
          sort_order?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          field_type?: string
          id?: string
          is_active?: boolean
          label?: string
          options?: Json
          program_id?: string | null
          required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      login_logs: {
        Row: {
          created_at: string
          email: string
          id: string
          profile_id: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          profile_id?: string | null
          success: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          profile_id?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          recipient_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          recipient_id: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          recipient_id?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      order_history: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          order_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          order_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          added_by_admin: boolean
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_name: string
          product_unit: string
          requested_quantity: number
          retained_quantity: number
        }
        Insert: {
          added_by_admin?: boolean
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          product_name: string
          product_unit: string
          requested_quantity?: number
          retained_quantity?: number
        }
        Update: {
          added_by_admin?: boolean
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          product_name?: string
          product_unit?: string
          requested_quantity?: number
          retained_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          agent_name: string
          comment: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decided_role: string | null
          id: string
          order_number: string | null
          pdf_path: string | null
          pickup_instructions: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["order_status"]
          verification_token: string | null
          zone_id: string
        }
        Insert: {
          agent_name: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decided_role?: string | null
          id?: string
          order_number?: string | null
          pdf_path?: string | null
          pickup_instructions?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          verification_token?: string | null
          zone_id: string
        }
        Update: {
          agent_name?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decided_role?: string | null
          id?: string
          order_number?: string | null
          pdf_path?: string | null
          pickup_instructions?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          verification_token?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_available: boolean
          name: string
          unit: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean
          name: string
          unit: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean
          name?: string
          unit?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_name: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          region_id: string | null
          zone_id: string | null
        }
        Insert: {
          account_name: string
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          region_id?: string | null
          zone_id?: string | null
        }
        Update: {
          account_name?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          region_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          created_at: string
          id: string
          name: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          zone_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      series: {
        Row: {
          created_at: string
          id: string
          label: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      speakers: {
        Row: {
          created_at: string
          id: string
          name: string
          role_title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role_title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role_title?: string | null
        }
        Relationships: []
      }
      student_records: {
        Row: {
          agent_name: string
          campaign_id: string
          class_id: string
          created_at: string
          created_by: string | null
          custom_values: Json
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          fields_snapshot: Json
          first_name: string
          id: string
          is_deleted: boolean
          last_name: string
          school_id: string
          series_id: string | null
          sex: string
          zone_id: string
        }
        Insert: {
          agent_name: string
          campaign_id: string
          class_id: string
          created_at?: string
          created_by?: string | null
          custom_values?: Json
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          fields_snapshot?: Json
          first_name: string
          id?: string
          is_deleted?: boolean
          last_name: string
          school_id: string
          series_id?: string | null
          sex: string
          zone_id: string
        }
        Update: {
          agent_name?: string
          campaign_id?: string
          class_id?: string
          created_at?: string
          created_by?: string | null
          custom_values?: Json
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          fields_snapshot?: Json
          first_name?: string
          id?: string
          is_deleted?: boolean
          last_name?: string
          school_id?: string
          series_id?: string | null
          sex?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_records_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_records_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_records_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          region_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          region_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_order: {
        Args: { _items: Json; _order_id: string }
        Returns: undefined
      }
      can_manage_orders: { Args: never; Returns: boolean }
      can_read_all_records: { Args: never; Returns: boolean }
      can_read_orders: { Args: never; Returns: boolean }
      cancel_order: { Args: { _order_id: string }; Returns: undefined }
      create_order: {
        Args: {
          _agent_name: string
          _comment: string
          _items: Json
          _zone_id: string
        }
        Returns: string
      }
      current_region_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_zone_id: { Args: never; Returns: string }
      decide_order: {
        Args: { _decision: string; _order_id: string; _reason: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active: { Args: never; Returns: boolean }
      is_admin_principal: { Args: never; Returns: boolean }
      log_login_attempt: {
        Args: { _email: string; _success: boolean; _user_agent: string }
        Returns: undefined
      }
      log_order: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _order_id: string
        }
        Returns: undefined
      }
      mark_all_read: { Args: never; Returns: undefined }
      mark_notification_read: { Args: { _id: string }; Returns: undefined }
      mark_order_ready: {
        Args: { _order_id: string; _pickup_instructions: string }
        Returns: undefined
      }
      order_items_snapshot: { Args: { _order_id: string }; Returns: Json }
      soft_delete_record: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      stats_by_zone: {
        Args: { _campaign_id?: string }
        Returns: {
          region_name: string
          total: number
          zone_code: string
          zone_name: string
        }[]
      }
      stats_my_zone: {
        Args: never
        Returns: {
          campaign_id: string
          campaign_name: string
          today_count: number
          total_count: number
        }[]
      }
      stats_overview: { Args: never; Returns: Json }
      verify_order_token: { Args: { _token: string }; Returns: Json }
    }
    Enums: {
      app_role:
        | "admin_principal"
        | "admin_logistique"
        | "dg"
        | "promoteur"
        | "superviseur"
        | "zone"
      order_status: "pending" | "cancelled" | "validated" | "rejected" | "ready"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin_principal",
        "admin_logistique",
        "dg",
        "promoteur",
        "superviseur",
        "zone",
      ],
      order_status: ["pending", "cancelled", "validated", "rejected", "ready"],
    },
  },
} as const
