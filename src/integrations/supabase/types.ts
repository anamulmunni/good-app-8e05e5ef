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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      reset_history: {
        Row: {
          id: number
          payment_method: string | null
          payment_number: string | null
          phone_number: string
          reset_at: string | null
          submitted_by: string
          verified_count: number
        }
        Insert: {
          id?: number
          payment_method?: string | null
          payment_number?: string | null
          phone_number: string
          reset_at?: string | null
          submitted_by?: string
          verified_count?: number
        }
        Update: {
          id?: number
          payment_method?: string | null
          payment_number?: string | null
          phone_number?: string
          reset_at?: string | null
          submitted_by?: string
          verified_count?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: number
          key: string
          value: string
        }
        Insert: {
          id?: number
          key: string
          value: string
        }
        Update: {
          id?: number
          key?: string
          value?: string
        }
        Relationships: []
      }
      submitted_numbers: {
        Row: {
          id: number
          payment_method: string | null
          payment_number: string | null
          phone_number: string
          submitted_at: string | null
          submitted_by: string
          verified_count: number
        }
        Insert: {
          id?: number
          payment_method?: string | null
          payment_number?: string | null
          phone_number: string
          submitted_at?: string | null
          submitted_by?: string
          verified_count?: number
        }
        Update: {
          id?: number
          payment_method?: string | null
          payment_number?: string | null
          phone_number?: string
          submitted_at?: string | null
          submitted_by?: string
          verified_count?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string | null
          details: string | null
          id: number
          status: string | null
          type: string
          user_id: number
        }
        Insert: {
          amount: number
          created_at?: string | null
          details?: string | null
          id?: number
          status?: string | null
          type: string
          user_id: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          details?: string | null
          id?: number
          status?: string | null
          type?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string | null
          avatar_url: string | null
          balance: number
          created_at: string | null
          display_name: string | null
          guest_id: string
          id: number
          is_blocked: boolean
          key_count: number
          payment_scheduled_at: string | null
          payment_status: string
        }
        Insert: {
          auth_id?: string | null
          avatar_url?: string | null
          balance?: number
          created_at?: string | null
          display_name?: string | null
          guest_id: string
          id?: number
          is_blocked?: boolean
          key_count?: number
          payment_scheduled_at?: string | null
          payment_status?: string
        }
        Update: {
          auth_id?: string | null
          avatar_url?: string | null
          balance?: number
          created_at?: string | null
          display_name?: string | null
          guest_id?: string
          id?: number
          is_blocked?: boolean
          key_count?: number
          payment_scheduled_at?: string | null
          payment_status?: string
        }
        Relationships: []
      }
      verification_pool: {
        Row: {
          added_by: string
          created_at: string | null
          id: number
          is_used: boolean
          private_key: string
          verify_url: string
        }
        Insert: {
          added_by?: string
          created_at?: string | null
          id?: number
          is_used?: boolean
          private_key: string
          verify_url: string
        }
        Update: {
          added_by?: string
          created_at?: string | null
          id?: number
          is_used?: boolean
          private_key?: string
          verify_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
