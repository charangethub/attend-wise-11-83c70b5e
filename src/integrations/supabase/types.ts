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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          student_id: string | null
          student_name: string | null
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          student_id?: string | null
          student_name?: string | null
          user_email?: string
          user_id: string
          user_name?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          student_id?: string | null
          student_name?: string | null
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          marked_by: string
          remark: string | null
          session: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          marked_by: string
          remark?: string | null
          session?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          marked_by?: string
          remark?: string | null
          session?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      page_access: {
        Row: {
          has_access: boolean
          id: string
          page_name: string
          user_id: string
        }
        Insert: {
          has_access?: boolean
          id?: string
          page_name: string
          user_id: string
        }
        Update: {
          has_access?: boolean
          id?: string
          page_name?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_datasets: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          sheet_url: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          sheet_url?: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          sheet_url?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      students: {
        Row: {
          batch_type: string
          center: string
          classroom_id: string
          classroom_name: string
          created_at: string
          curriculum: string
          dataset: string
          emergency_contact_1: string
          emergency_contact_2: string
          enrollment_date: string
          enrollment_status: string
          grade: string
          id: string
          mobile_number: string
          order_id: string
          roll_no: string
          student_name: string
          updated_at: string
          user_id_vedantu: string
          zone: string
        }
        Insert: {
          batch_type?: string
          center?: string
          classroom_id?: string
          classroom_name?: string
          created_at?: string
          curriculum?: string
          dataset?: string
          emergency_contact_1?: string
          emergency_contact_2?: string
          enrollment_date?: string
          enrollment_status?: string
          grade?: string
          id?: string
          mobile_number?: string
          order_id?: string
          roll_no?: string
          student_name?: string
          updated_at?: string
          user_id_vedantu?: string
          zone?: string
        }
        Update: {
          batch_type?: string
          center?: string
          classroom_id?: string
          classroom_name?: string
          created_at?: string
          curriculum?: string
          dataset?: string
          emergency_contact_1?: string
          emergency_contact_2?: string
          enrollment_date?: string
          enrollment_status?: string
          grade?: string
          id?: string
          mobile_number?: string
          order_id?: string
          roll_no?: string
          student_name?: string
          updated_at?: string
          user_id_vedantu?: string
          zone?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string | null
          value?: string
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          is_online: boolean
          last_seen_at: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          is_online?: boolean
          last_seen_at?: string
          user_email?: string
          user_id: string
          user_name?: string
        }
        Update: {
          is_online?: boolean
          last_seen_at?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          admin_panel_access: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          admin_panel_access?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          admin_panel_access?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_status: {
        Row: {
          created_at: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "teacher"
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
      app_role: ["owner", "admin", "teacher"],
    },
  },
} as const
