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
      call_signals: {
        Row: {
          caller_id: number
          created_at: string | null
          id: string
          receiver_id: number
          signal_data: Json | null
          signal_type: string
        }
        Insert: {
          caller_id: number
          created_at?: string | null
          id?: string
          receiver_id: number
          signal_data?: Json | null
          signal_type: string
        }
        Update: {
          caller_id?: number
          created_at?: string | null
          id?: string
          receiver_id?: number
          signal_data?: Json | null
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signals_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_subscriptions: {
        Row: {
          channel_user_id: number
          created_at: string
          id: string
          subscriber_user_id: number
        }
        Insert: {
          channel_user_id: number
          created_at?: string
          id?: string
          subscriber_user_id: number
        }
        Update: {
          channel_user_id?: number
          created_at?: string
          id?: string
          subscriber_user_id?: number
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: number
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: number
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          participant_1: number
          participant_2: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          participant_1: number
          participant_2: number
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          participant_1?: number
          participant_2?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_participant_1_fkey"
            columns: ["participant_1"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_2_fkey"
            columns: ["participant_2"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string | null
          id: string
          receiver_id: number
          sender_id: number
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          receiver_id: number
          sender_id: number
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          receiver_id?: number
          sender_id?: number
          status?: string
        }
        Relationships: []
      }
      message_hidden: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: number
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_hidden_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_hidden_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          media_url: string | null
          message_type: string
          sender_id: number
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string
          sender_id: number
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string
          sender_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          content: string | null
          created_at: string | null
          from_user_id: number | null
          id: string
          is_read: boolean
          reference_id: string | null
          type: string
          user_id: number
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          from_user_id?: number | null
          id?: string
          is_read?: boolean
          reference_id?: string | null
          type?: string
          user_id: number
        }
        Update: {
          content?: string | null
          created_at?: string | null
          from_user_id?: number | null
          id?: string
          is_read?: boolean
          reference_id?: string | null
          type?: string
          user_id?: number
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          parent_comment_id: string | null
          post_id: string
          user_id: number
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          parent_comment_id?: string | null
          post_id: string
          user_id: number
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: number
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          reaction_type: string
          user_id: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          reaction_type?: string
          user_id: number
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          comments_count: number
          content: string | null
          created_at: string | null
          id: string
          image_url: string | null
          likes_count: number
          user_id: number
          video_url: string | null
        }
        Insert: {
          comments_count?: number
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          likes_count?: number
          user_id: number
          video_url?: string | null
        }
        Update: {
          comments_count?: number
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          likes_count?: number
          user_id?: number
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
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
      stories: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          image_url: string
          music_name: string | null
          user_id: number
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          image_url: string
          music_name?: string | null
          user_id: number
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string
          music_name?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      story_reactions: {
        Row: {
          created_at: string
          id: string
          reaction_type: string
          story_id: string
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          reaction_type?: string
          story_id: string
          user_id: number
        }
        Update: {
          created_at?: string
          id?: string
          reaction_type?: string
          story_id?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_reactions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_user_id: number
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_user_id: number
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_user_id_fkey"
            columns: ["viewer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      tiktok_videos: {
        Row: {
          added_by: string
          caption: string | null
          category: string
          created_at: string
          id: string
          is_active: boolean
          video_id: string
          video_url: string
        }
        Insert: {
          added_by?: string
          caption?: string | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          video_id: string
          video_url: string
        }
        Update: {
          added_by?: string
          caption?: string | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          video_id?: string
          video_url?: string
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
      user_request_submissions: {
        Row: {
          id: string
          request_count: number
          submitted_at: string
          submitted_to_admin_by: string
          submitter_payment_method: string | null
          submitter_payment_number: string | null
          submitter_rate: number
          target_display_name: string | null
          target_guest_id: string
          target_user_id: number | null
          target_verified_count: number
        }
        Insert: {
          id?: string
          request_count?: number
          submitted_at?: string
          submitted_to_admin_by?: string
          submitter_payment_method?: string | null
          submitter_payment_number?: string | null
          submitter_rate?: number
          target_display_name?: string | null
          target_guest_id: string
          target_user_id?: number | null
          target_verified_count?: number
        }
        Update: {
          id?: string
          request_count?: number
          submitted_at?: string
          submitted_to_admin_by?: string
          submitter_payment_method?: string | null
          submitter_payment_number?: string | null
          submitter_rate?: number
          target_display_name?: string | null
          target_guest_id?: string
          target_user_id?: number | null
          target_verified_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_request_submissions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_transfer_requests: {
        Row: {
          created_at: string
          id: number
          requester_guest_id: string
          requester_payment_method: string | null
          requester_payment_number: string
          requester_user_id: number
          requester_verified_count: number
          status: string
          submitted_at: string | null
          submitted_batch_id: string | null
          target_guest_id: string
          target_user_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          requester_guest_id: string
          requester_payment_method?: string | null
          requester_payment_number: string
          requester_user_id: number
          requester_verified_count?: number
          status?: string
          submitted_at?: string | null
          submitted_batch_id?: string | null
          target_guest_id: string
          target_user_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          requester_guest_id?: string
          requester_payment_method?: string | null
          requester_payment_number?: string
          requester_user_id?: number
          requester_verified_count?: number
          status?: string
          submitted_at?: string | null
          submitted_batch_id?: string | null
          target_guest_id?: string
          target_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_transfer_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_transfer_requests_submitted_batch_id_fkey"
            columns: ["submitted_batch_id"]
            isOneToOne: false
            referencedRelation: "user_request_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_transfer_requests_target_user_id_fkey"
            columns: ["target_user_id"]
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
          cover_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          guest_id: string
          id: number
          is_blocked: boolean
          is_verified_badge: boolean
          key_count: number
          last_reels_seen_at: string | null
          online_at: string | null
          payment_scheduled_at: string | null
          payment_status: string
          watched_video_url: string | null
        }
        Insert: {
          auth_id?: string | null
          avatar_url?: string | null
          balance?: number
          cover_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          guest_id: string
          id?: number
          is_blocked?: boolean
          is_verified_badge?: boolean
          key_count?: number
          last_reels_seen_at?: string | null
          online_at?: string | null
          payment_scheduled_at?: string | null
          payment_status?: string
          watched_video_url?: string | null
        }
        Update: {
          auth_id?: string | null
          avatar_url?: string | null
          balance?: number
          cover_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          guest_id?: string
          id?: number
          is_blocked?: boolean
          is_verified_badge?: boolean
          key_count?: number
          last_reels_seen_at?: string | null
          online_at?: string | null
          payment_scheduled_at?: string | null
          payment_status?: string
          watched_video_url?: string | null
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
      admin_cancel_requests_by_requester: {
        Args: { p_requester_guest_id: string }
        Returns: number
      }
      admin_cancel_transfer_batch: {
        Args: { p_batch_id: string }
        Returns: number
      }
      admin_dismiss_transfer_request: {
        Args: { p_request_id: number }
        Returns: boolean
      }
      admin_reset_transfer_batch: {
        Args: { p_admin_name?: string; p_batch_id: string }
        Returns: number
      }
      admin_reset_transfer_request: {
        Args: { p_admin_name?: string; p_request_id: number }
        Returns: boolean
      }
      cancel_incoming_request: {
        Args: { p_request_id: number; p_target_guest_id: string }
        Returns: boolean
      }
      recalculate_all_balances: { Args: { p_rate: number }; Returns: undefined }
      submit_user_request_batch:
        | {
            Args: {
              p_password: string
              p_submitter_name: string
              p_submitter_payment_method?: string
              p_submitter_payment_number?: string
              p_target_guest_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_password: string
              p_submitter_name: string
              p_submitter_payment_method?: string
              p_submitter_payment_number?: string
              p_submitter_rate?: number
              p_target_guest_id: string
            }
            Returns: string
          }
      sync_user_request_submission_count: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
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
