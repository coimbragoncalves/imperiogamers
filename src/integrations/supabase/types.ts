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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ads: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          position: string
          script: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          position: string
          script?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          position?: string
          script?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_post_logs: {
        Row: {
          article_id: string | null
          content_type: string
          created_at: string
          error_message: string | null
          id: string
          source_site: string
          source_url: string
          status: string
        }
        Insert: {
          article_id?: string | null
          content_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          source_site: string
          source_url: string
          status?: string
        }
        Update: {
          article_id?: string | null
          content_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          source_site?: string
          source_url?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_post_logs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          last_run_at: string | null
          schedule_times: Json
          source_sites: Json
          updated_at: string
          youtube_channels: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_run_at?: string | null
          schedule_times?: Json
          source_sites?: Json
          updated_at?: string
          youtube_channels?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_run_at?: string | null
          schedule_times?: Json
          source_sites?: Json
          updated_at?: string
          youtube_channels?: Json
        }
        Relationships: []
      }
      article_images: {
        Row: {
          article_id: string
          caption: string | null
          created_at: string
          id: string
          image_url: string
          position: number
        }
        Insert: {
          article_id: string
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          position?: number
        }
        Update: {
          article_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_images_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_id: string | null
          content: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          cover_image: string | null
          created_at: string
          description: string | null
          dislikes: number
          id: string
          is_published: boolean
          likes: number
          slug: string
          title: string
          updated_at: string
          video_url: string | null
          views: number
          youtube_url: string | null
        }
        Insert: {
          author_id?: string | null
          content?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          cover_image?: string | null
          created_at?: string
          description?: string | null
          dislikes?: number
          id?: string
          is_published?: boolean
          likes?: number
          slug: string
          title: string
          updated_at?: string
          video_url?: string | null
          views?: number
          youtube_url?: string | null
        }
        Update: {
          author_id?: string | null
          content?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          cover_image?: string | null
          created_at?: string
          description?: string | null
          dislikes?: number
          id?: string
          is_published?: boolean
          likes?: number
          slug?: string
          title?: string
          updated_at?: string
          video_url?: string | null
          views?: number
          youtube_url?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          article_id: string
          content: string
          created_at: string
          guest_name: string | null
          id: string
          is_hidden: boolean
          parent_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          article_id: string
          content: string
          created_at?: string
          guest_name?: string | null
          id?: string
          is_hidden?: boolean
          parent_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          article_id?: string
          content?: string
          created_at?: string
          guest_name?: string | null
          id?: string
          is_hidden?: boolean
          parent_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      downloads: {
        Row: {
          category: string
          cover_image: string | null
          created_at: string
          description: string | null
          download_url: string
          downloads_count: number
          file_size: string | null
          id: string
          is_published: boolean
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          category?: string
          cover_image?: string | null
          created_at?: string
          description?: string | null
          download_url: string
          downloads_count?: number
          file_size?: string | null
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          category?: string
          cover_image?: string | null
          created_at?: string
          description?: string | null
          download_url?: string
          downloads_count?: number
          file_size?: string | null
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reactions: {
        Row: {
          article_id: string
          created_at: string
          guest_id: string | null
          id: string
          reaction_type: string
          user_id: string | null
        }
        Insert: {
          article_id: string
          created_at?: string
          guest_id?: string | null
          id?: string
          reaction_type: string
          user_id?: string | null
        }
        Update: {
          article_id?: string
          created_at?: string
          guest_id?: string | null
          id?: string
          reaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reactions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_slug: { Args: { title: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_download_count: {
        Args: { download_id: string }
        Returns: undefined
      }
      increment_download_views: {
        Args: { download_id: string }
        Returns: undefined
      }
      increment_views: { Args: { article_id: string }; Returns: undefined }
      update_reaction_counts: {
        Args: {
          p_article_id: string
          p_dislike_delta: number
          p_like_delta: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      content_type: "news" | "review" | "trailer" | "other"
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
    Enums: {
      app_role: ["admin", "user"],
      content_type: ["news", "review", "trailer", "other"],
    },
  },
} as const
