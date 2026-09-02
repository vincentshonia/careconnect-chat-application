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
      ai_responses: {
        Row: {
          agent_flag: string | null
          answer: string
          confidence: number | null
          conversation_id: string | null
          created_at: string
          escalated: boolean
          id: string
          message_id: string | null
          model: string | null
          organization_id: string
          question: string
          sources: Json
          visitor_feedback: string | null
          website_id: string | null
        }
        Insert: {
          agent_flag?: string | null
          answer: string
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          escalated?: boolean
          id?: string
          message_id?: string | null
          model?: string | null
          organization_id: string
          question: string
          sources?: Json
          visitor_feedback?: string | null
          website_id?: string | null
        }
        Update: {
          agent_flag?: string | null
          answer?: string
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          escalated?: boolean
          id?: string
          message_id?: string | null
          model?: string | null
          organization_id?: string
          question?: string
          sources?: Json
          visitor_feedback?: string | null
          website_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_responses_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_responses_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_responses_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          id: string
          ip_address: string | null
          new_value: Json | null
          organization_id: string | null
          previous_value: Json | null
          record_id: string | null
          record_type: string | null
          user_agent: string | null
          website_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          organization_id?: string | null
          previous_value?: Json | null
          record_id?: string | null
          record_type?: string | null
          user_agent?: string | null
          website_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          organization_id?: string | null
          previous_value?: Json | null
          record_id?: string | null
          record_type?: string | null
          user_agent?: string | null
          website_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          close_time: string
          created_at: string
          day_of_week: number
          department_id: string | null
          id: string
          is_closed: boolean
          open_time: string
          organization_id: string
          website_id: string | null
        }
        Insert: {
          close_time?: string
          created_at?: string
          day_of_week: number
          department_id?: string | null
          id?: string
          is_closed?: boolean
          open_time?: string
          organization_id: string
          website_id?: string | null
        }
        Update: {
          close_time?: string
          created_at?: string
          day_of_week?: number
          department_id?: string | null
          id?: string
          is_closed?: boolean
          open_time?: string
          organization_id?: string
          website_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_hours_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_hours_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          consent_at: string | null
          consent_given: boolean
          county: string | null
          created_at: string
          email: string | null
          first_contact_at: string
          full_name: string
          health_plan: string | null
          id: string
          last_contact_at: string
          lead_status: string
          notes: string | null
          organization_id: string
          owner_id: string | null
          phone: string | null
          preferred_contact_method: string | null
          preferred_language: string | null
          service_interest: string | null
          tags: string[]
          updated_at: string
          visitor_type: string | null
          website_id: string | null
          zip_code: string | null
        }
        Insert: {
          consent_at?: string | null
          consent_given?: boolean
          county?: string | null
          created_at?: string
          email?: string | null
          first_contact_at?: string
          full_name: string
          health_plan?: string | null
          id?: string
          last_contact_at?: string
          lead_status?: string
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          phone?: string | null
          preferred_contact_method?: string | null
          preferred_language?: string | null
          service_interest?: string | null
          tags?: string[]
          updated_at?: string
          visitor_type?: string | null
          website_id?: string | null
          zip_code?: string | null
        }
        Update: {
          consent_at?: string | null
          consent_given?: boolean
          county?: string | null
          created_at?: string
          email?: string | null
          first_contact_at?: string
          full_name?: string
          health_plan?: string | null
          id?: string
          last_contact_at?: string
          lead_status?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          phone?: string | null
          preferred_contact_method?: string | null
          preferred_language?: string | null
          service_interest?: string | null
          tags?: string[]
          updated_at?: string
          visitor_type?: string | null
          website_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_events: {
        Row: {
          actor_id: string | null
          conversation_id: string
          created_at: string
          detail: string | null
          event_type: string
          id: string
          new_value: string | null
          organization_id: string
          previous_value: string | null
        }
        Insert: {
          actor_id?: string | null
          conversation_id: string
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
          new_value?: string | null
          organization_id: string
          previous_value?: string | null
        }
        Update: {
          actor_id?: string | null
          conversation_id?: string
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
          new_value?: string | null
          organization_id?: string
          previous_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_ratings: {
        Row: {
          comment: string | null
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
          score: number
          source: string
          website_id: string | null
        }
        Insert: {
          comment?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
          score: number
          source?: string
          website_id?: string | null
        }
        Update: {
          comment?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          score?: number
          source?: string
          website_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_ratings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          claimed_at: string | null
          closed_at: string | null
          closed_by: string | null
          contact_id: string | null
          created_at: string
          department_id: string | null
          escalation_reason: string | null
          escalation_requested: boolean
          first_agent_response_at: string | null
          first_human_requested_at: string | null
          first_response_at: string | null
          id: string
          is_ai_only: boolean
          last_agent_message_at: string | null
          last_message_at: string
          last_visitor_message_at: string | null
          organization_id: string
          outcome: string | null
          priority: Database["public"]["Enums"]["conversation_priority"]
          reference: string
          reopened_count: number
          requested_agent_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          tags: string[]
          transfer_count: number
          unread_agent_count: number
          updated_at: string
          visitor_id: string | null
          visitor_type: string
          website_id: string
          workspace_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          claimed_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          contact_id?: string | null
          created_at?: string
          department_id?: string | null
          escalation_reason?: string | null
          escalation_requested?: boolean
          first_agent_response_at?: string | null
          first_human_requested_at?: string | null
          first_response_at?: string | null
          id?: string
          is_ai_only?: boolean
          last_agent_message_at?: string | null
          last_message_at?: string
          last_visitor_message_at?: string | null
          organization_id: string
          outcome?: string | null
          priority?: Database["public"]["Enums"]["conversation_priority"]
          reference?: string
          reopened_count?: number
          requested_agent_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          tags?: string[]
          transfer_count?: number
          unread_agent_count?: number
          updated_at?: string
          visitor_id?: string | null
          visitor_type?: string
          website_id: string
          workspace_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          claimed_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          contact_id?: string | null
          created_at?: string
          department_id?: string | null
          escalation_reason?: string | null
          escalation_requested?: boolean
          first_agent_response_at?: string | null
          first_human_requested_at?: string | null
          first_response_at?: string | null
          id?: string
          is_ai_only?: boolean
          last_agent_message_at?: string | null
          last_message_at?: string
          last_visitor_message_at?: string | null
          organization_id?: string
          outcome?: string | null
          priority?: Database["public"]["Enums"]["conversation_priority"]
          reference?: string
          reopened_count?: number
          requested_agent_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          tags?: string[]
          transfer_count?: number
          unread_agent_count?: number
          updated_at?: string
          visitor_id?: string | null
          visitor_type?: string
          website_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      department_members: {
        Row: {
          created_at: string
          department_id: string
          id: string
          last_assigned_at: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          last_assigned_at?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          last_assigned_at?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          routing_method: string
          status: Database["public"]["Enums"]["entity_status"]
          timezone: string
          updated_at: string
          website_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          routing_method?: string
          status?: Database["public"]["Enums"]["entity_status"]
          timezone?: string
          updated_at?: string
          website_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          routing_method?: string
          status?: Database["public"]["Enums"]["entity_status"]
          timezone?: string
          updated_at?: string
          website_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          applies_to_all: boolean
          category: string
          created_at: string
          helpful_count: number
          id: string
          not_helpful_count: number
          organization_id: string
          question: string
          sort_order: number
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          view_count: number
          website_ids: string[]
        }
        Insert: {
          answer: string
          applies_to_all?: boolean
          category?: string
          created_at?: string
          helpful_count?: number
          id?: string
          not_helpful_count?: number
          organization_id: string
          question: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          view_count?: number
          website_ids?: string[]
        }
        Update: {
          answer?: string
          applies_to_all?: boolean
          category?: string
          created_at?: string
          helpful_count?: number
          id?: string
          not_helpful_count?: number
          organization_id?: string
          question?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          view_count?: number
          website_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "faqs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
          organization_id: string
          website_id: string | null
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
          organization_id: string
          website_id?: string | null
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
          organization_id?: string
          website_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: string | null
          event_type: string
          id: string
          intake_id: string
          new_value: string | null
          organization_id: string
          previous_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
          intake_id: string
          new_value?: string | null
          organization_id: string
          previous_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
          intake_id?: string
          new_value?: string | null
          organization_id?: string
          previous_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "intake_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_requests: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          county: string | null
          created_at: string
          department_id: string | null
          due_date: string | null
          email: string | null
          full_name: string
          health_plan: string | null
          id: string
          notes: string | null
          organization_id: string
          phone: string | null
          preferred_contact_method: string | null
          preferred_language: string | null
          priority: Database["public"]["Enums"]["conversation_priority"]
          reference: string
          request_type: Database["public"]["Enums"]["intake_type"]
          service_interest: string | null
          source: string
          stage: Database["public"]["Enums"]["intake_stage"]
          stage_changed_at: string
          submitted_at: string | null
          updated_at: string
          website_id: string | null
          zip_code: string | null
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          county?: string | null
          created_at?: string
          department_id?: string | null
          due_date?: string | null
          email?: string | null
          full_name: string
          health_plan?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          preferred_contact_method?: string | null
          preferred_language?: string | null
          priority?: Database["public"]["Enums"]["conversation_priority"]
          reference?: string
          request_type?: Database["public"]["Enums"]["intake_type"]
          service_interest?: string | null
          source?: string
          stage?: Database["public"]["Enums"]["intake_stage"]
          stage_changed_at?: string
          submitted_at?: string | null
          updated_at?: string
          website_id?: string | null
          zip_code?: string | null
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          county?: string | null
          created_at?: string
          department_id?: string | null
          due_date?: string | null
          email?: string | null
          full_name?: string
          health_plan?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          preferred_contact_method?: string | null
          preferred_language?: string | null
          priority?: Database["public"]["Enums"]["conversation_priority"]
          reference?: string
          request_type?: Database["public"]["Enums"]["intake_type"]
          service_interest?: string | null
          source?: string
          stage?: Database["public"]["Enums"]["intake_stage"]
          stage_changed_at?: string
          submitted_at?: string | null
          updated_at?: string
          website_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_requests_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      knowledge_articles: {
        Row: {
          applies_to_all: boolean
          approved_at: string | null
          approved_by: string | null
          category_id: string | null
          content: string
          created_at: string
          created_by: string | null
          effective_date: string | null
          id: string
          organization_id: string
          review_date: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["kb_status"]
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
          version: number
          website_ids: string[]
          workspace_id: string | null
        }
        Insert: {
          applies_to_all?: boolean
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          organization_id: string
          review_date?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["kb_status"]
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          website_ids?: string[]
          workspace_id?: string | null
        }
        Update: {
          applies_to_all?: boolean
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          organization_id?: string
          review_date?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["kb_status"]
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          website_ids?: string[]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          article_id: string
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          organization_id: string
        }
        Insert: {
          article_id: string
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          article_id?: string
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          sender_name: string | null
          sender_type: string
          sender_user_id: string | null
          website_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          sender_name?: string | null
          sender_type: string
          sender_user_id?: string | null
          website_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          sender_name?: string | null
          sender_type?: string
          sender_user_id?: string | null
          website_id?: string
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
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_escalations: boolean
          email_low_rating: boolean
          email_new_intake: boolean
          email_sla_breach: boolean
          inapp_escalations: boolean
          inapp_low_rating: boolean
          inapp_new_intake: boolean
          inapp_sla_breach: boolean
          organization_id: string | null
          sla_first_response_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_escalations?: boolean
          email_low_rating?: boolean
          email_new_intake?: boolean
          email_sla_breach?: boolean
          inapp_escalations?: boolean
          inapp_low_rating?: boolean
          inapp_new_intake?: boolean
          inapp_sla_breach?: boolean
          organization_id?: string | null
          sla_first_response_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_escalations?: boolean
          email_low_rating?: boolean
          email_new_intake?: boolean
          email_sla_breach?: boolean
          inapp_escalations?: boolean
          inapp_low_rating?: boolean
          inapp_new_intake?: boolean
          inapp_sla_breach?: boolean
          organization_id?: string | null
          sla_first_response_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          organization_id: string
          read_at: string | null
          record_id: string | null
          record_type: string | null
          severity: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          organization_id: string
          read_at?: string | null
          record_id?: string | null
          record_type?: string | null
          severity?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          organization_id?: string
          read_at?: string | null
          record_id?: string | null
          record_type?: string | null
          severity?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          department_ids: string[]
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          title: string | null
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          department_ids?: string[]
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          title?: string | null
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          department_ids?: string[]
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          title?: string | null
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_limits: {
        Row: {
          created_at: string
          hard_stop: boolean
          ip_requests_per_minute: number
          max_prompt_chars: number
          monthly_ai_messages: number
          monthly_ai_tokens: number
          organization_id: string
          session_ai_messages_per_minute: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hard_stop?: boolean
          ip_requests_per_minute?: number
          max_prompt_chars?: number
          monthly_ai_messages?: number
          monthly_ai_tokens?: number
          organization_id: string
          session_ai_messages_per_minute?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hard_stop?: boolean
          ip_requests_per_minute?: number
          max_prompt_chars?: number
          monthly_ai_messages?: number
          monthly_ai_tokens?: number
          organization_id?: string
          session_ai_messages_per_minute?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["membership_status"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          ai_instructions: string | null
          created_at: string
          description: string | null
          email: string | null
          emergency_message: string
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          primary_color: string
          privacy_notice: string
          require_mfa: boolean
          require_mfa_for_admins: boolean
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          ai_instructions?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          emergency_message?: string
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          primary_color?: string
          privacy_notice?: string
          require_mfa?: boolean
          require_mfa_for_admins?: boolean
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          ai_instructions?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          emergency_message?: string
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_color?: string
          privacy_notice?: string
          require_mfa?: boolean
          require_mfa_for_admins?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_targets: {
        Row: {
          completion_percent: number | null
          created_at: string
          csat_target: number | null
          department_id: string | null
          first_response_minutes: number | null
          followup_max: number | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"] | null
          sla_percent: number | null
          updated_at: string
        }
        Insert: {
          completion_percent?: number | null
          created_at?: string
          csat_target?: number | null
          department_id?: string | null
          first_response_minutes?: number | null
          followup_max?: number | null
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"] | null
          sla_percent?: number | null
          updated_at?: string
        }
        Update: {
          completion_percent?: number | null
          created_at?: string
          csat_target?: number | null
          department_id?: string | null
          first_response_minutes?: number | null
          followup_max?: number | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          sla_percent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_targets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: []
      }
      platform_role_permissions: {
        Row: {
          created_at: string
          permission: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Insert: {
          created_at?: string
          permission: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Update: {
          created_at?: string
          permission?: string
          role?: Database["public"]["Enums"]["platform_role"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          chat_prefs: Json
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string
          id: string
          languages: string[]
          last_active_at: string | null
          max_concurrent_chats: number
          notification_prefs: Json
          organization_id: string | null
          phone: string | null
          presence: string
          show_in_widget_team: boolean
          status: Database["public"]["Enums"]["entity_status"]
          theme_preference: string
          timezone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          chat_prefs?: Json
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string
          id: string
          languages?: string[]
          last_active_at?: string | null
          max_concurrent_chats?: number
          notification_prefs?: Json
          organization_id?: string | null
          phone?: string | null
          presence?: string
          show_in_widget_team?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          theme_preference?: string
          timezone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          chat_prefs?: Json
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string
          id?: string
          languages?: string[]
          last_active_at?: string | null
          max_concurrent_chats?: number
          notification_prefs?: Json
          organization_id?: string | null
          phone?: string | null
          presence?: string
          show_in_widget_team?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          theme_preference?: string
          timezone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_reviews: {
        Row: {
          accuracy_score: number
          agent_id: string | null
          coaching_notes: string | null
          compliance_score: number
          conversation_id: string
          created_at: string
          flagged: boolean
          id: string
          organization_id: string
          overall_score: number | null
          resolution_score: number
          reviewer_id: string | null
          reviewer_name: string | null
          tone_score: number
          updated_at: string
        }
        Insert: {
          accuracy_score: number
          agent_id?: string | null
          coaching_notes?: string | null
          compliance_score: number
          conversation_id: string
          created_at?: string
          flagged?: boolean
          id?: string
          organization_id: string
          overall_score?: number | null
          resolution_score: number
          reviewer_id?: string | null
          reviewer_name?: string | null
          tone_score: number
          updated_at?: string
        }
        Update: {
          accuracy_score?: number
          agent_id?: string | null
          coaching_notes?: string | null
          compliance_score?: number
          conversation_id?: string
          created_at?: string
          flagged?: boolean
          id?: string
          organization_id?: string
          overall_score?: number | null
          resolution_score?: number
          reviewer_id?: string | null
          reviewer_name?: string | null
          tone_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_reviews_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket_key: string
          created_at: string
          hits: number
          id: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          created_at?: string
          hits?: number
          id?: string
          window_start?: string
        }
        Update: {
          bucket_key?: string
          created_at?: string
          hits?: number
          id?: string
          window_start?: string
        }
        Relationships: []
      }
      response_templates: {
        Row: {
          approved: boolean
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          language: string
          name: string
          organization_id: string
          shortcut: string | null
          updated_at: string
          website_id: string | null
        }
        Insert: {
          approved?: boolean
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          language?: string
          name: string
          organization_id: string
          shortcut?: string | null
          updated_at?: string
          website_id?: string | null
        }
        Update: {
          approved?: boolean
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          language?: string
          name?: string
          organization_id?: string
          shortcut?: string | null
          updated_at?: string
          website_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "response_templates_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_templates_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      routing_rules: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          match_type: string
          match_value: string
          name: string
          organization_id: string
          priority: number
          routing_method: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          website_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          match_type?: string
          match_value: string
          name: string
          organization_id: string
          priority?: number
          routing_method?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          website_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          match_type?: string
          match_value?: string
          name?: string
          organization_id?: string
          priority?: number
          routing_method?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          website_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routing_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_rules_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          applies_to_all: boolean
          counties: string[]
          created_at: string
          eligibility_overview: string | null
          health_plans: string[]
          id: string
          learn_more_url: string | null
          name: string
          organization_id: string
          short_description: string
          sort_order: number
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          website_ids: string[]
        }
        Insert: {
          applies_to_all?: boolean
          counties?: string[]
          created_at?: string
          eligibility_overview?: string | null
          health_plans?: string[]
          id?: string
          learn_more_url?: string | null
          name: string
          organization_id: string
          short_description?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          website_ids?: string[]
        }
        Update: {
          applies_to_all?: boolean
          counties?: string[]
          created_at?: string
          eligibility_overview?: string | null
          health_plans?: string[]
          id?: string
          learn_more_url?: string | null
          name?: string
          organization_id?: string
          short_description?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          website_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progress: {
        Row: {
          completed_at: string
          guide_role: string
          id: string
          organization_id: string
          section_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          guide_role: string
          id?: string
          organization_id: string
          section_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          guide_role?: string
          id?: string
          organization_id?: string
          section_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_review_flags: {
        Row: {
          flagged_at: string | null
          flagged_by: string | null
          guide_role: string
          guide_version: string | null
          id: string
          note: string | null
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          flagged_at?: string | null
          flagged_by?: string | null
          guide_role: string
          guide_version?: string | null
          id?: string
          note?: string | null
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          flagged_at?: string | null
          flagged_by?: string | null
          guide_role?: string
          guide_version?: string | null
          id?: string
          note?: string | null
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_review_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          metric: string
          organization_id: string
          period: string
          updated_at: string
          value: number
        }
        Insert: {
          metric: string
          organization_id: string
          period: string
          updated_at?: string
          value?: number
        }
        Update: {
          metric?: string
          organization_id?: string
          period?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      visitors: {
        Row: {
          browser: string | null
          current_page: string | null
          device_type: string | null
          first_seen_at: string
          id: string
          landing_page: string | null
          last_seen_at: string
          organization_id: string
          referrer: string | null
          region: string | null
          session_token: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          website_id: string
        }
        Insert: {
          browser?: string | null
          current_page?: string | null
          device_type?: string | null
          first_seen_at?: string
          id?: string
          landing_page?: string | null
          last_seen_at?: string
          organization_id: string
          referrer?: string | null
          region?: string | null
          session_token: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          website_id: string
        }
        Update: {
          browser?: string | null
          current_page?: string | null
          device_type?: string | null
          first_seen_at?: string
          id?: string
          landing_page?: string | null
          last_seen_at?: string
          organization_id?: string
          referrer?: string | null
          region?: string | null
          session_token?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      websites: {
        Row: {
          accent_color: string
          agent_avatar_url: string | null
          ai_instructions: string | null
          allowed_domains: string[]
          auto_open: boolean
          border_radius: number
          chatbot_name: string
          consent_language: string
          created_at: string
          dev_mode: boolean
          domain: string
          font_family: string
          help_title: string
          hidden_paths: string[]
          home_cta_subtitle: string
          home_cta_title: string
          home_greeting: string
          home_headline: string
          home_subtitle: string
          id: string
          logo_url: string | null
          menu_buttons: Json
          name: string
          offline_message: string
          organization_id: string
          primary_color: string
          privacy_disclaimer: string
          privacy_footer_text: string
          public_key: string
          show_help_tab: boolean
          show_home_tab: boolean
          show_requests_tab: boolean
          show_services_tab: boolean
          status: Database["public"]["Enums"]["entity_status"]
          tab_config: Json
          timezone: string
          trigger_delay_seconds: number
          trigger_message: string
          trigger_once_per_visit: boolean
          trigger_repeat_days: number
          updated_at: string
          verification_token: string | null
          verified_at: string | null
          welcome_message: string
          widget_position: string
          widget_size: string
          workspace_id: string | null
        }
        Insert: {
          accent_color?: string
          agent_avatar_url?: string | null
          ai_instructions?: string | null
          allowed_domains?: string[]
          auto_open?: boolean
          border_radius?: number
          chatbot_name?: string
          consent_language?: string
          created_at?: string
          dev_mode?: boolean
          domain: string
          font_family?: string
          help_title?: string
          hidden_paths?: string[]
          home_cta_subtitle?: string
          home_cta_title?: string
          home_greeting?: string
          home_headline?: string
          home_subtitle?: string
          id?: string
          logo_url?: string | null
          menu_buttons?: Json
          name: string
          offline_message?: string
          organization_id: string
          primary_color?: string
          privacy_disclaimer?: string
          privacy_footer_text?: string
          public_key?: string
          show_help_tab?: boolean
          show_home_tab?: boolean
          show_requests_tab?: boolean
          show_services_tab?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          tab_config?: Json
          timezone?: string
          trigger_delay_seconds?: number
          trigger_message?: string
          trigger_once_per_visit?: boolean
          trigger_repeat_days?: number
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
          welcome_message?: string
          widget_position?: string
          widget_size?: string
          workspace_id?: string | null
        }
        Update: {
          accent_color?: string
          agent_avatar_url?: string | null
          ai_instructions?: string | null
          allowed_domains?: string[]
          auto_open?: boolean
          border_radius?: number
          chatbot_name?: string
          consent_language?: string
          created_at?: string
          dev_mode?: boolean
          domain?: string
          font_family?: string
          help_title?: string
          hidden_paths?: string[]
          home_cta_subtitle?: string
          home_cta_title?: string
          home_greeting?: string
          home_headline?: string
          home_subtitle?: string
          id?: string
          logo_url?: string | null
          menu_buttons?: Json
          name?: string
          offline_message?: string
          organization_id?: string
          primary_color?: string
          privacy_disclaimer?: string
          privacy_footer_text?: string
          public_key?: string
          show_help_tab?: boolean
          show_home_tab?: boolean
          show_requests_tab?: boolean
          show_services_tab?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          tab_config?: Json
          timezone?: string
          trigger_delay_seconds?: number
          trigger_message?: string
          trigger_once_per_visit?: boolean
          trigger_repeat_days?: number
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
          welcome_message?: string
          widget_position?: string
          widget_size?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "websites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "websites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_round_robin: {
        Args: { _conversation: string; _department: string }
        Returns: Json
      }
      bump_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      bump_usage: {
        Args: { _amount?: number; _metric: string; _org: string }
        Returns: number
      }
      busy_conversation_statuses: {
        Args: never
        Returns: Database["public"]["Enums"]["conversation_status"][]
      }
      can_access_org: { Args: { _org: string }; Returns: boolean }
      can_reply_conversation: {
        Args: { _conversation: string }
        Returns: boolean
      }
      can_view_contact: {
        Args: { _contact: string; _org: string; _owner: string }
        Returns: boolean
      }
      can_view_conversation: {
        Args: { _assigned: string; _dept: string; _org: string }
        Returns: boolean
      }
      can_view_conversation_id: {
        Args: { _conversation: string }
        Returns: boolean
      }
      can_view_intake: {
        Args: { _assigned: string; _dept: string; _org: string }
        Returns: boolean
      }
      claim_conversation: {
        Args: { _conversation: string; _user: string }
        Returns: Json
      }
      claimable_conversation_statuses: {
        Args: never
        Returns: Database["public"]["Enums"]["conversation_status"][]
      }
      conversation_human_touched: { Args: { _id: string }; Returns: boolean }
      current_org_id: { Args: never; Returns: string }
      current_rank: { Args: never; Returns: number }
      dashboard_metrics: {
        Args: {
          _dept: string[]
          _from: string
          _org: string
          _prev_from: string
          _prev_to: string
          _scope: string
          _sla?: number
          _to: string
          _user: string
        }
        Returns: Json
      }
      dashboard_staff_performance: {
        Args: {
          _from: string
          _org: string
          _sla?: number
          _to: string
          _user: string
        }
        Returns: Json
      }
      eligible_notification_recipients: {
        Args: { _department: string; _org: string; _pref: string }
        Returns: {
          user_id: string
        }[]
      }
      has_perm: {
        Args: { _org: string; _perm: string; _user?: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      intake_stage_counts: {
        Args: { _dept?: string; _org: string; _search?: string; _type?: string }
        Returns: Json
      }
      is_org_admin: { Args: { _org: string }; Returns: boolean }
      is_org_member: {
        Args: { _org: string; _user?: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user?: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      match_knowledge: {
        Args: {
          _org: string
          _website: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          article_id: string
          chunk_id: string
          content: string
          similarity: number
          source_url: string
          title: string
        }[]
      }
      my_department_ids: {
        Args: { _org: string; _user?: string }
        Returns: string[]
      }
      my_mfa_requirement: { Args: never; Returns: boolean }
      next_round_robin_agent: {
        Args: { _department: string }
        Returns: {
          full_name: string
          membership_id: string
          user_id: string
        }[]
      }
      org_role_of: {
        Args: { _org: string; _user?: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      org_role_rank: { Args: { _org: string; _user?: string }; Returns: number }
      platform_can: {
        Args: { _perm: string; _user?: string }
        Returns: boolean
      }
      platform_role_of: {
        Args: { _user?: string }
        Returns: Database["public"]["Enums"]["platform_role"]
      }
      quality_summary: { Args: { _org: string }; Returns: Json }
      reassignment_candidates: {
        Args: { _conversation: string; _org: string }
        Returns: {
          active_chats: number
          capacity: number
          department_names: string[]
          eligible: boolean
          full_name: string
          in_department: boolean
          presence: string
          reason: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      refresh_report_statistics: { Args: never; Returns: undefined }
      report_ai: {
        Args: {
          _dept?: string[]
          _from: string
          _org: string
          _to: string
          _website?: string
        }
        Returns: Json
      }
      report_conv: {
        Args: {
          _dept?: string[]
          _from: string
          _org: string
          _priority?: string
          _staff?: string[]
          _statuses?: string[]
          _to: string
          _transfer?: string
          _type?: string
          _website?: string
        }
        Returns: {
          assigned_to: string | null
          channel: string
          claimed_at: string | null
          closed_at: string | null
          closed_by: string | null
          contact_id: string | null
          created_at: string
          department_id: string | null
          escalation_reason: string | null
          escalation_requested: boolean
          first_agent_response_at: string | null
          first_human_requested_at: string | null
          first_response_at: string | null
          id: string
          is_ai_only: boolean
          last_agent_message_at: string | null
          last_message_at: string
          last_visitor_message_at: string | null
          organization_id: string
          outcome: string | null
          priority: Database["public"]["Enums"]["conversation_priority"]
          reference: string
          reopened_count: number
          requested_agent_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          tags: string[]
          transfer_count: number
          unread_agent_count: number
          updated_at: string
          visitor_id: string | null
          visitor_type: string
          website_id: string
          workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      report_department_backlog: {
        Args: { _dept?: string[]; _org: string; _sla?: number }
        Returns: Json
      }
      report_departments: {
        Args: {
          _dept?: string[]
          _from: string
          _org: string
          _priority?: string
          _sla?: number
          _staff?: string[]
          _statuses?: string[]
          _to: string
          _transfer?: string
          _type?: string
          _website?: string
        }
        Returns: Json
      }
      report_intake: {
        Args: {
          _dept?: string[]
          _from: string
          _limit?: number
          _offset?: number
          _org: string
          _staff?: string[]
          _to: string
        }
        Returns: Json
      }
      report_overview: {
        Args: {
          _dept?: string[]
          _from: string
          _org: string
          _priority?: string
          _sla?: number
          _staff?: string[]
          _statuses?: string[]
          _to: string
          _transfer?: string
          _type?: string
          _website?: string
        }
        Returns: Json
      }
      report_sla: {
        Args: {
          _dept?: string[]
          _from: string
          _org: string
          _priority?: string
          _sla?: number
          _staff?: string[]
          _statuses?: string[]
          _to: string
          _transfer?: string
          _type?: string
          _website?: string
        }
        Returns: Json
      }
      report_staff: {
        Args: {
          _dept?: string[]
          _from: string
          _org: string
          _priority?: string
          _sla?: number
          _staff?: string[]
          _statuses?: string[]
          _to: string
          _transfer?: string
          _type?: string
          _website?: string
        }
        Returns: Json
      }
      report_staff_workload: {
        Args: { _dept?: string[]; _org: string }
        Returns: Json
      }
      report_tickets: {
        Args: {
          _dept?: string[]
          _dir?: string
          _flag?: string
          _from: string
          _limit?: number
          _offset?: number
          _org: string
          _priority?: string
          _sla?: number
          _sort?: string
          _staff?: string[]
          _statuses?: string[]
          _to: string
          _transfer?: string
          _type?: string
          _website?: string
        }
        Returns: Json
      }
      report_transfers: {
        Args: {
          _dept?: string[]
          _from: string
          _limit?: number
          _offset?: number
          _org: string
          _to: string
        }
        Returns: Json
      }
      report_volume: {
        Args: {
          _dept?: string[]
          _from: string
          _org: string
          _priority?: string
          _staff?: string[]
          _statuses?: string[]
          _to: string
          _transfer?: string
          _type?: string
          _website?: string
        }
        Returns: Json
      }
      role_rank: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: number
      }
      round_robin_candidates: {
        Args: { _department: string }
        Returns: {
          full_name: string
          membership_id: string
          user_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      staff_directory: {
        Args: {
          _dept?: string
          _limit?: number
          _offset?: number
          _org: string
          _role?: Database["public"]["Enums"]["app_role"]
          _search?: string
          _status?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "agent"
        | "team_lead"
        | "manager"
        | "administrator"
        | "super_admin"
      conversation_priority: "low" | "normal" | "high" | "urgent"
      conversation_status:
        | "new"
        | "waiting"
        | "assigned"
        | "active"
        | "pending_visitor"
        | "pending_internal"
        | "follow_up"
        | "escalated"
        | "resolved"
        | "closed"
        | "spam"
        | "archived"
      entity_status: "active" | "inactive" | "suspended" | "archived"
      intake_stage:
        | "new"
        | "in_review"
        | "contacted"
        | "eligibility_check"
        | "submitted"
        | "approved"
        | "denied"
        | "withdrawn"
      intake_type: "referral" | "enrollment" | "general" | "callback"
      kb_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "published"
        | "archived"
        | "expired"
      membership_status: "invited" | "active" | "suspended" | "removed"
      platform_role:
        | "platform_owner"
        | "platform_admin"
        | "platform_support"
        | "platform_billing"
        | "platform_read_only"
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
        "agent",
        "team_lead",
        "manager",
        "administrator",
        "super_admin",
      ],
      conversation_priority: ["low", "normal", "high", "urgent"],
      conversation_status: [
        "new",
        "waiting",
        "assigned",
        "active",
        "pending_visitor",
        "pending_internal",
        "follow_up",
        "escalated",
        "resolved",
        "closed",
        "spam",
        "archived",
      ],
      entity_status: ["active", "inactive", "suspended", "archived"],
      intake_stage: [
        "new",
        "in_review",
        "contacted",
        "eligibility_check",
        "submitted",
        "approved",
        "denied",
        "withdrawn",
      ],
      intake_type: ["referral", "enrollment", "general", "callback"],
      kb_status: [
        "draft",
        "pending_review",
        "approved",
        "published",
        "archived",
        "expired",
      ],
      membership_status: ["invited", "active", "suspended", "removed"],
      platform_role: [
        "platform_owner",
        "platform_admin",
        "platform_support",
        "platform_billing",
        "platform_read_only",
      ],
    },
  },
} as const
