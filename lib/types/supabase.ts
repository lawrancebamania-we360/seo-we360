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
      ai_overview_citations: {
        Row: {
          ai_overview_appeared: boolean | null
          ai_overview_text: string | null
          checked_at: string
          cited_sources: Json | null
          cited_url: string | null
          id: string
          keyword: string
          project_cited: boolean | null
          project_id: string
        }
        Insert: {
          ai_overview_appeared?: boolean | null
          ai_overview_text?: string | null
          checked_at?: string
          cited_sources?: Json | null
          cited_url?: string | null
          id?: string
          keyword: string
          project_cited?: boolean | null
          project_id: string
        }
        Update: {
          ai_overview_appeared?: boolean | null
          ai_overview_text?: string | null
          checked_at?: string
          cited_sources?: Json | null
          cited_url?: string | null
          id?: string
          keyword?: string
          project_cited?: boolean | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_overview_citations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      article_comments: {
        Row: {
          article_id: string
          comment: string
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          article_id: string
          comment: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          article_id?: string
          comment?: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_comments_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          ai_provider: string | null
          approved_at: string | null
          approved_by: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string
          keyword_id: string | null
          meta_description: string | null
          outline: Json | null
          project_id: string
          published_at: string | null
          published_url: string | null
          rejection_reason: string | null
          secondary_keywords: Json | null
          slug: string | null
          status: string | null
          target_keyword: string | null
          title: string
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          ai_provider?: string | null
          approved_at?: string | null
          approved_by?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          keyword_id?: string | null
          meta_description?: string | null
          outline?: Json | null
          project_id: string
          published_at?: string | null
          published_url?: string | null
          rejection_reason?: string | null
          secondary_keywords?: Json | null
          slug?: string | null
          status?: string | null
          target_keyword?: string | null
          title: string
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          ai_provider?: string | null
          approved_at?: string | null
          approved_by?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          keyword_id?: string | null
          meta_description?: string | null
          outline?: Json | null
          project_id?: string
          published_at?: string | null
          published_url?: string | null
          rejection_reason?: string | null
          secondary_keywords?: Json | null
          slug?: string | null
          status?: string | null
          target_keyword?: string | null
          title?: string
          updated_at?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_findings: {
        Row: {
          check_name: string
          created_at: string | null
          details: Json | null
          id: string
          impl: string | null
          message: string | null
          pillar: string | null
          priority: string | null
          project_id: string
          run_id: string | null
          skill: string
          status: string
          url: string
        }
        Insert: {
          check_name: string
          created_at?: string | null
          details?: Json | null
          id?: string
          impl?: string | null
          message?: string | null
          pillar?: string | null
          priority?: string | null
          project_id: string
          run_id?: string | null
          skill: string
          status: string
          url: string
        }
        Update: {
          check_name?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          impl?: string | null
          message?: string | null
          pillar?: string | null
          priority?: string | null
          project_id?: string
          run_id?: string | null
          skill?: string
          status?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_findings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_profile: {
        Row: {
          checked_at: string
          dofollow_count: number | null
          id: string
          nofollow_count: number | null
          project_id: string
          referring_domains: number | null
          run_id: string
          top_anchors: Json | null
          top_backlinks: Json | null
          total_backlinks: number | null
        }
        Insert: {
          checked_at?: string
          dofollow_count?: number | null
          id?: string
          nofollow_count?: number | null
          project_id: string
          referring_domains?: number | null
          run_id?: string
          top_anchors?: Json | null
          top_backlinks?: Json | null
          total_backlinks?: number | null
        }
        Update: {
          checked_at?: string
          dofollow_count?: number | null
          id?: string
          nofollow_count?: number | null
          project_id?: string
          referring_domains?: number | null
          run_id?: string
          top_anchors?: Json | null
          top_backlinks?: Json | null
          total_backlinks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_profile_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_audit_trail: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          id: string
          ip: unknown
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          ip?: unknown
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          ip?: unknown
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      competitors: {
        Row: {
          analysis_status: string | null
          auto_analysis: Json | null
          created_at: string | null
          da: number | null
          id: string
          last_analyzed_at: string | null
          last_checked: string | null
          name: string
          notes: string | null
          opportunities: Json | null
          pa: number | null
          project_id: string
          top_keywords: Json | null
          traffic: number | null
          url: string
        }
        Insert: {
          analysis_status?: string | null
          auto_analysis?: Json | null
          created_at?: string | null
          da?: number | null
          id?: string
          last_analyzed_at?: string | null
          last_checked?: string | null
          name: string
          notes?: string | null
          opportunities?: Json | null
          pa?: number | null
          project_id: string
          top_keywords?: Json | null
          traffic?: number | null
          url: string
        }
        Update: {
          analysis_status?: string | null
          auto_analysis?: Json | null
          created_at?: string | null
          da?: number | null
          id?: string
          last_analyzed_at?: string | null
          last_checked?: string | null
          name?: string
          notes?: string | null
          opportunities?: Json | null
          pa?: number | null
          project_id?: string
          top_keywords?: Json | null
          traffic?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_freshness: {
        Row: {
          decay_pct: number | null
          detected_at: string
          id: string
          page_path: string
          project_id: string
          refresh_task_id: string | null
          status: string
          views_last_7d: number | null
          views_prior_30d: number | null
          views_prior_90d: number | null
        }
        Insert: {
          decay_pct?: number | null
          detected_at?: string
          id?: string
          page_path: string
          project_id: string
          refresh_task_id?: string | null
          status?: string
          views_last_7d?: number | null
          views_prior_30d?: number | null
          views_prior_90d?: number | null
        }
        Update: {
          decay_pct?: number | null
          detected_at?: string
          id?: string
          page_path?: string
          project_id?: string
          refresh_task_id?: string | null
          status?: string
          views_last_7d?: number | null
          views_prior_30d?: number | null
          views_prior_90d?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_freshness_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_freshness_refresh_task_id_fkey"
            columns: ["refresh_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      content_gaps: {
        Row: {
          checked_at: string
          featured_snippet_opportunity: boolean | null
          gap_score: number | null
          id: string
          keyword: string
          missing_subtopics: Json | null
          project_id: string
          suggested_keywords: Json | null
          suggested_outline: Json | null
        }
        Insert: {
          checked_at?: string
          featured_snippet_opportunity?: boolean | null
          gap_score?: number | null
          id?: string
          keyword: string
          missing_subtopics?: Json | null
          project_id: string
          suggested_keywords?: Json | null
          suggested_outline?: Json | null
        }
        Update: {
          checked_at?: string
          featured_snippet_opportunity?: boolean | null
          gap_score?: number | null
          id?: string
          keyword?: string
          missing_subtopics?: Json | null
          project_id?: string
          suggested_keywords?: Json | null
          suggested_outline?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "content_gaps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          completed_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          items_processed: number | null
          phase: string
          project_id: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          items_processed?: number | null
          phase: string
          project_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          items_processed?: number | null
          phase?: string
          project_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cron_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cwv_snapshots: {
        Row: {
          captured_at: string | null
          cls: number | null
          device: string
          fcp: number | null
          fid: number | null
          id: string
          inp: number | null
          lcp: number | null
          project_id: string
          score: number | null
          si: number | null
          tbt: number | null
          ttfb: number | null
          url: string | null
        }
        Insert: {
          captured_at?: string | null
          cls?: number | null
          device: string
          fcp?: number | null
          fid?: number | null
          id?: string
          inp?: number | null
          lcp?: number | null
          project_id: string
          score?: number | null
          si?: number | null
          tbt?: number | null
          ttfb?: number | null
          url?: string | null
        }
        Update: {
          captured_at?: string | null
          cls?: number | null
          device?: string
          fcp?: number | null
          fid?: number | null
          id?: string
          inp?: number | null
          lcp?: number | null
          project_id?: string
          score?: number | null
          si?: number | null
          tbt?: number | null
          ttfb?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cwv_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_authority: {
        Row: {
          checked_at: string
          da_score: number | null
          domain: string
          domain_age_days: number | null
          has_robots: boolean | null
          has_sitemap: boolean | null
          http_healthy: boolean | null
          id: string
          is_project_domain: boolean | null
          project_id: string
          ssl_valid: boolean | null
          tech_stack: Json | null
        }
        Insert: {
          checked_at?: string
          da_score?: number | null
          domain: string
          domain_age_days?: number | null
          has_robots?: boolean | null
          has_sitemap?: boolean | null
          http_healthy?: boolean | null
          id?: string
          is_project_domain?: boolean | null
          project_id: string
          ssl_valid?: boolean | null
          tech_stack?: Json | null
        }
        Update: {
          checked_at?: string
          da_score?: number | null
          domain?: string
          domain_age_days?: number | null
          has_robots?: boolean | null
          has_sitemap?: boolean | null
          http_healthy?: boolean | null
          id?: string
          is_project_domain?: boolean | null
          project_id?: string
          ssl_valid?: boolean | null
          tech_stack?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_authority_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      eeat_reports: {
        Row: {
          analyzed_pages: Json | null
          authoritativeness_score: number | null
          created_at: string
          experience_score: number | null
          expertise_score: number | null
          generated_by: string | null
          id: string
          overall_score: number | null
          project_id: string
          provider: string | null
          recommendations: Json | null
          strengths: Json | null
          trust_score: number | null
          weaknesses: Json | null
        }
        Insert: {
          analyzed_pages?: Json | null
          authoritativeness_score?: number | null
          created_at?: string
          experience_score?: number | null
          expertise_score?: number | null
          generated_by?: string | null
          id?: string
          overall_score?: number | null
          project_id: string
          provider?: string | null
          recommendations?: Json | null
          strengths?: Json | null
          trust_score?: number | null
          weaknesses?: Json | null
        }
        Update: {
          analyzed_pages?: Json | null
          authoritativeness_score?: number | null
          created_at?: string
          experience_score?: number | null
          expertise_score?: number | null
          generated_by?: string | null
          id?: string
          overall_score?: number | null
          project_id?: string
          provider?: string | null
          recommendations?: Json | null
          strengths?: Json | null
          trust_score?: number | null
          weaknesses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "eeat_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_index_status: {
        Row: {
          checked_at: string | null
          coverage_state: string | null
          details: Json | null
          google_canonical: string | null
          id: string
          indexing_state: string | null
          last_crawl_time: string | null
          mobile_usability_verdict: string | null
          page_fetch_state: string | null
          project_id: string
          rich_results_verdict: string | null
          robots_txt_state: string | null
          url: string
          user_canonical: string | null
          verdict: string | null
        }
        Insert: {
          checked_at?: string | null
          coverage_state?: string | null
          details?: Json | null
          google_canonical?: string | null
          id?: string
          indexing_state?: string | null
          last_crawl_time?: string | null
          mobile_usability_verdict?: string | null
          page_fetch_state?: string | null
          project_id: string
          rich_results_verdict?: string | null
          robots_txt_state?: string | null
          url: string
          user_canonical?: string | null
          verdict?: string | null
        }
        Update: {
          checked_at?: string | null
          coverage_state?: string | null
          details?: Json | null
          google_canonical?: string | null
          id?: string
          indexing_state?: string | null
          last_crawl_time?: string | null
          mobile_usability_verdict?: string | null
          page_fetch_state?: string | null
          project_id?: string
          rich_results_verdict?: string | null
          robots_txt_state?: string | null
          url?: string
          user_canonical?: string | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gsc_index_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json | null
          created_at: string | null
          enabled: boolean | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          project_id: string | null
          provider: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          project_id?: string | null
          provider: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          project_id?: string | null
          provider?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_runs: {
        Row: {
          actor: string
          completed_at: string | null
          cost_estimate_usd: number | null
          error_message: string | null
          id: string
          project_id: string
          rows_inserted: number | null
          started_at: string
          status: string
        }
        Insert: {
          actor: string
          completed_at?: string | null
          cost_estimate_usd?: number | null
          error_message?: string | null
          id?: string
          project_id: string
          rows_inserted?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          actor?: string
          completed_at?: string | null
          cost_estimate_usd?: number | null
          error_message?: string | null
          id?: string
          project_id?: string
          rows_inserted?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          discount_cents: number | null
          id: string
          invoice_number: string | null
          line_items: Json | null
          org_id: string
          paid_at: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          receipt_id: string
          status: string
          subscription_id: string | null
          tax_cents: number | null
          total_cents: number
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          discount_cents?: number | null
          id?: string
          invoice_number?: string | null
          line_items?: Json | null
          org_id: string
          paid_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          receipt_id: string
          status?: string
          subscription_id?: string | null
          tax_cents?: number | null
          total_cents: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          discount_cents?: number | null
          id?: string
          invoice_number?: string | null
          line_items?: Json | null
          org_id?: string
          paid_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          receipt_id?: string
          status?: string
          subscription_id?: string | null
          tax_cents?: number | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_razorpay_order_id_fkey"
            columns: ["razorpay_order_id"]
            isOneToOne: false
            referencedRelation: "razorpay_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_cannibalization: {
        Row: {
          click_split_ratio: number | null
          competing_urls: Json
          detected_at: string
          id: string
          project_id: string
          query: string
          severity: string
          total_clicks: number | null
          total_impressions: number | null
          url_count: number
        }
        Insert: {
          click_split_ratio?: number | null
          competing_urls?: Json
          detected_at?: string
          id?: string
          project_id: string
          query: string
          severity?: string
          total_clicks?: number | null
          total_impressions?: number | null
          url_count?: number
        }
        Update: {
          click_split_ratio?: number | null
          competing_urls?: Json
          detected_at?: string
          id?: string
          project_id?: string
          query?: string
          severity?: string
          total_clicks?: number | null
          total_impressions?: number | null
          url_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "keyword_cannibalization_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_uploads: {
        Row: {
          created_at: string | null
          error_message: string | null
          filename: string
          id: string
          imported_count: number | null
          project_id: string
          row_count: number | null
          skipped_count: number | null
          status: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          filename: string
          id?: string
          imported_count?: number | null
          project_id: string
          row_count?: number | null
          skipped_count?: number | null
          status?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          filename?: string
          id?: string
          imported_count?: number | null
          project_id?: string
          row_count?: number | null
          skipped_count?: number | null
          status?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keyword_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          cluster: string | null
          competition: string | null
          created_at: string | null
          created_by: string | null
          current_rank: number | null
          current_traffic: number | null
          id: string
          intent: string | null
          kd: number | null
          keyword: string
          last_checked: string | null
          potential_traffic: number | null
          previous_rank: number | null
          priority: string | null
          project_id: string
          search_volume: number | null
          source: string | null
          target_page: string | null
          target_rank: number | null
          trend: string | null
          updated_at: string | null
        }
        Insert: {
          cluster?: string | null
          competition?: string | null
          created_at?: string | null
          created_by?: string | null
          current_rank?: number | null
          current_traffic?: number | null
          id?: string
          intent?: string | null
          kd?: number | null
          keyword: string
          last_checked?: string | null
          potential_traffic?: number | null
          previous_rank?: number | null
          priority?: string | null
          project_id: string
          search_volume?: number | null
          source?: string | null
          target_page?: string | null
          target_rank?: number | null
          trend?: string | null
          updated_at?: string | null
        }
        Update: {
          cluster?: string | null
          competition?: string | null
          created_at?: string | null
          created_by?: string | null
          current_rank?: number | null
          current_traffic?: number | null
          id?: string
          intent?: string | null
          kd?: number | null
          keyword?: string
          last_checked?: string | null
          potential_traffic?: number | null
          previous_rank?: number | null
          priority?: string | null
          project_id?: string
          search_volume?: number | null
          source?: string | null
          target_page?: string | null
          target_rank?: number | null
          trend?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keywords_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keywords_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permissions: {
        Row: {
          can_add: boolean | null
          can_complete: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          id: string
          project_id: string
          section: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_add?: boolean | null
          can_complete?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          id?: string
          project_id: string
          section: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_add?: boolean | null
          can_complete?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          id?: string
          project_id?: string
          section?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          is_internal: boolean | null
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal?: boolean | null
          name: string
          owner_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_internal?: boolean | null
          name?: string
          owner_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pillar_scores: {
        Row: {
          breakdown: Json | null
          captured_at: string | null
          id: string
          pillar: string
          project_id: string
          score: number
          top_issues: Json | null
        }
        Insert: {
          breakdown?: Json | null
          captured_at?: string | null
          id?: string
          pillar: string
          project_id: string
          score: number
          top_issues?: Json | null
        }
        Update: {
          breakdown?: Json | null
          captured_at?: string | null
          id?: string
          pillar?: string
          project_id?: string
          score?: number
          top_issues?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pillar_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_period: string
          created_at: string
          description: string | null
          display_order: number
          entitlements: Json
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          price_annual_inr_cents: number | null
          price_annual_usd_cents: number | null
          price_inr_cents: number
          price_usd_cents: number
          razorpay_plan_id: string | null
          slug: string
          trial_days: number | null
          updated_at: string
        }
        Insert: {
          billing_period?: string
          created_at?: string
          description?: string | null
          display_order?: number
          entitlements?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          price_annual_inr_cents?: number | null
          price_annual_usd_cents?: number | null
          price_inr_cents?: number
          price_usd_cents?: number
          razorpay_plan_id?: string | null
          slug: string
          trial_days?: number | null
          updated_at?: string
        }
        Update: {
          billing_period?: string
          created_at?: string
          description?: string | null
          display_order?: number
          entitlements?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          price_annual_inr_cents?: number | null
          price_annual_usd_cents?: number | null
          price_inr_cents?: number
          price_usd_cents?: number
          razorpay_plan_id?: string | null
          slug?: string
          trial_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: number
          internal_email_domains: Json | null
          maintenance_mode: boolean | null
          signup_open: boolean | null
          trial_days: number | null
          trial_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          id?: number
          internal_email_domains?: Json | null
          maintenance_mode?: boolean | null
          signup_open?: boolean | null
          trial_days?: number | null
          trial_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          id?: number
          internal_email_domains?: Json | null
          maintenance_mode?: boolean | null
          signup_open?: boolean | null
          trial_days?: number | null
          trial_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_project_id: string | null
          avatar_url: string | null
          created_at: string | null
          email: string
          encrypted_claude_key: string | null
          encrypted_openai_key: string | null
          id: string
          last_active: string | null
          name: string
          platform_admin: boolean
          preferred_ai_model: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          active_project_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          encrypted_claude_key?: string | null
          encrypted_openai_key?: string | null
          id: string
          last_active?: string | null
          name: string
          platform_admin?: boolean
          preferred_ai_model?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          active_project_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          encrypted_claude_key?: string | null
          encrypted_openai_key?: string | null
          id?: string
          last_active?: string | null
          name?: string
          platform_admin?: boolean
          preferred_ai_model?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_project_id_fkey"
            columns: ["active_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_kickoff_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          phase: string | null
          phases_complete: Json | null
          project_id: string
          result: Json | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          phase?: string | null
          phases_complete?: Json | null
          project_id: string
          result?: Json | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          phase?: string | null
          phases_complete?: Json | null
          project_id?: string
          result?: Json | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_kickoff_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_kickoff_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memberships: {
        Row: {
          added_by: string | null
          created_at: string | null
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memberships_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memberships_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          apify_keywords: Json | null
          country: string | null
          created_at: string | null
          created_by: string | null
          domain: string
          ga4_property_id: string | null
          gsc_property_url: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string
          org_id: string | null
          supports_multi_language: boolean | null
          target_keywords_seed: Json | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          apify_keywords?: Json | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          domain: string
          ga4_property_id?: string | null
          gsc_property_url?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          org_id?: string | null
          supports_multi_language?: boolean | null
          target_keywords_seed?: Json | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          apify_keywords?: Json | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          domain?: string
          ga4_property_id?: string | null
          gsc_property_url?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          org_id?: string | null
          supports_multi_language?: boolean | null
          target_keywords_seed?: Json | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_orders: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          notes: Json | null
          org_id: string
          plan_id: string
          razorpay_order_id: string
          razorpay_payment_id: string | null
          receipt_id: string
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          id?: string
          notes?: Json | null
          org_id: string
          plan_id: string
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          receipt_id: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: Json | null
          org_id?: string
          plan_id?: string
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          receipt_id?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_gaps: {
        Row: {
          canonical_status: string | null
          details: Json | null
          h1_status: string | null
          h1_text: string | null
          id: string
          images_status: string | null
          is_blog: boolean | null
          last_checked: string | null
          last_seen_at: string | null
          meta_status: string | null
          og_status: string | null
          page_title: string | null
          page_url: string
          project_id: string
          robots_status: string | null
          schema_status: string | null
          title_status: string | null
        }
        Insert: {
          canonical_status?: string | null
          details?: Json | null
          h1_status?: string | null
          h1_text?: string | null
          id?: string
          images_status?: string | null
          is_blog?: boolean | null
          last_checked?: string | null
          last_seen_at?: string | null
          meta_status?: string | null
          og_status?: string | null
          page_title?: string | null
          page_url: string
          project_id: string
          robots_status?: string | null
          schema_status?: string | null
          title_status?: string | null
        }
        Update: {
          canonical_status?: string | null
          details?: Json | null
          h1_status?: string | null
          h1_text?: string | null
          id?: string
          images_status?: string | null
          is_blog?: boolean | null
          last_checked?: string | null
          last_seen_at?: string | null
          meta_status?: string | null
          og_status?: string | null
          page_title?: string | null
          page_url?: string
          project_id?: string
          robots_status?: string | null
          schema_status?: string | null
          title_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_gaps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      serp_rankings: {
        Row: {
          checked_at: string
          country: string | null
          device: string | null
          id: string
          keyword: string
          owns_featured_snippet: boolean | null
          owns_paa: boolean | null
          paa_questions: Json | null
          position: number | null
          project_id: string
          related_searches: Json | null
          total_results: number | null
          url: string | null
        }
        Insert: {
          checked_at?: string
          country?: string | null
          device?: string | null
          id?: string
          keyword: string
          owns_featured_snippet?: boolean | null
          owns_paa?: boolean | null
          paa_questions?: Json | null
          position?: number | null
          project_id: string
          related_searches?: Json | null
          total_results?: number | null
          url?: string | null
        }
        Update: {
          checked_at?: string
          country?: string | null
          device?: string | null
          id?: string
          keyword?: string
          owns_featured_snippet?: boolean | null
          owns_paa?: boolean | null
          paa_questions?: Json | null
          position?: number | null
          project_id?: string
          related_searches?: Json | null
          total_results?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "serp_rankings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_period: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          entitlements_snapshot: Json
          id: string
          org_id: string
          plan_id: string
          razorpay_customer_id: string | null
          razorpay_subscription_id: string | null
          status: string
          trial_end_at: string | null
          updated_at: string
        }
        Insert: {
          billing_period?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          entitlements_snapshot?: Json
          id?: string
          org_id: string
          plan_id: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          trial_end_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_period?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          entitlements_snapshot?: Json
          id?: string
          org_id?: string
          plan_id?: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          trial_end_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          article_id: string | null
          brief: Json | null
          competition: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          done: boolean | null
          id: string
          impact: string | null
          impl: string | null
          intent: string | null
          issue: string | null
          keyword_id: string | null
          kind: string | null
          pillar: string | null
          priority: string | null
          project_id: string
          published_url: string | null
          reference_images: Json | null
          scheduled_date: string | null
          source: string | null
          sprint_status: string | null
          status: string | null
          supporting_links: Json | null
          target_keyword: string | null
          team_member_id: string | null
          timeline: string | null
          title: string
          updated_at: string | null
          url: string | null
          verified_by_ai: boolean | null
          word_count_target: number | null
        }
        Insert: {
          article_id?: string | null
          brief?: Json | null
          competition?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          done?: boolean | null
          id?: string
          impact?: string | null
          impl?: string | null
          intent?: string | null
          issue?: string | null
          keyword_id?: string | null
          kind?: string | null
          pillar?: string | null
          priority?: string | null
          project_id: string
          published_url?: string | null
          reference_images?: Json | null
          scheduled_date?: string | null
          source?: string | null
          sprint_status?: string | null
          status?: string | null
          supporting_links?: Json | null
          target_keyword?: string | null
          team_member_id?: string | null
          timeline?: string | null
          title: string
          updated_at?: string | null
          url?: string | null
          verified_by_ai?: boolean | null
          word_count_target?: number | null
        }
        Update: {
          article_id?: string | null
          brief?: Json | null
          competition?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          done?: boolean | null
          id?: string
          impact?: string | null
          impl?: string | null
          intent?: string | null
          issue?: string | null
          keyword_id?: string | null
          kind?: string | null
          pillar?: string | null
          priority?: string | null
          project_id?: string
          published_url?: string | null
          reference_images?: Json | null
          scheduled_date?: string | null
          source?: string | null
          sprint_status?: string | null
          status?: string | null
          supporting_links?: Json | null
          target_keyword?: string | null
          team_member_id?: string | null
          timeline?: string | null
          title?: string
          updated_at?: string | null
          url?: string | null
          verified_by_ai?: boolean | null
          word_count_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_cluster_items: {
        Row: {
          already_covered_by: Json | null
          cluster_id: string
          created_at: string
          id: string
          intent: string | null
          kd_estimate: string | null
          outline: Json | null
          position: number
          project_id: string
          reason: string | null
          target_keyword: string | null
          task_id: string | null
          title: string
          word_count_target: number | null
        }
        Insert: {
          already_covered_by?: Json | null
          cluster_id: string
          created_at?: string
          id?: string
          intent?: string | null
          kd_estimate?: string | null
          outline?: Json | null
          position?: number
          project_id: string
          reason?: string | null
          target_keyword?: string | null
          task_id?: string | null
          title: string
          word_count_target?: number | null
        }
        Update: {
          already_covered_by?: Json | null
          cluster_id?: string
          created_at?: string
          id?: string
          intent?: string | null
          kd_estimate?: string | null
          outline?: Json | null
          position?: number
          project_id?: string
          reason?: string | null
          target_keyword?: string | null
          task_id?: string | null
          title?: string
          word_count_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_cluster_items_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "topic_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_cluster_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_cluster_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_clusters: {
        Row: {
          cost_estimate_usd: number | null
          coverage_already_covered: number | null
          coverage_new: number | null
          coverage_pct: number | null
          coverage_total: number | null
          created_at: string
          generated_by: string | null
          id: string
          interlinking: Json
          pillar_outline: Json
          pillar_primary_keyword: string | null
          pillar_slug: string | null
          pillar_summary: string | null
          pillar_title: string
          pillar_word_target: number | null
          project_id: string
          provider: string | null
          roadmap: Json
          seed_keyword: string
        }
        Insert: {
          cost_estimate_usd?: number | null
          coverage_already_covered?: number | null
          coverage_new?: number | null
          coverage_pct?: number | null
          coverage_total?: number | null
          created_at?: string
          generated_by?: string | null
          id?: string
          interlinking?: Json
          pillar_outline?: Json
          pillar_primary_keyword?: string | null
          pillar_slug?: string | null
          pillar_summary?: string | null
          pillar_title: string
          pillar_word_target?: number | null
          project_id: string
          provider?: string | null
          roadmap?: Json
          seed_keyword: string
        }
        Update: {
          cost_estimate_usd?: number | null
          coverage_already_covered?: number | null
          coverage_new?: number | null
          coverage_pct?: number | null
          coverage_total?: number | null
          created_at?: string
          generated_by?: string | null
          id?: string
          interlinking?: Json
          pillar_outline?: Json
          pillar_primary_keyword?: string | null
          pillar_slug?: string | null
          pillar_summary?: string | null
          pillar_title?: string
          pillar_word_target?: number | null
          project_id?: string
          provider?: string | null
          roadmap?: Json
          seed_keyword?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_clusters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          cost_cents: number
          created_at: string
          feature: string
          id: string
          kind: string
          metadata: Json | null
          org_id: string
          user_id: string | null
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          feature: string
          id?: string
          kind: string
          metadata?: Json | null
          org_id: string
          user_id?: string | null
        }
        Update: {
          cost_cents?: number
          created_at?: string
          feature?: string
          id?: string
          kind?: string
          metadata?: Json | null
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_snapshots: {
        Row: {
          ai_calls: number
          ai_cost_cents: number
          apify_cost_cents: number
          apify_runs: number
          org_id: string
          period_end: string
          period_start: string
          snapshot_at: string
          total_cost_cents: number
        }
        Insert: {
          ai_calls?: number
          ai_cost_cents?: number
          apify_cost_cents?: number
          apify_runs?: number
          org_id: string
          period_end: string
          period_start: string
          snapshot_at?: string
          total_cost_cents?: number
        }
        Update: {
          ai_calls?: number
          ai_cost_cents?: number
          apify_cost_cents?: number
          apify_runs?: number
          org_id?: string
          period_end?: string
          period_start?: string
          snapshot_at?: string
          total_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          razorpay_event_id: string
          retry_count: number | null
          signature: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          razorpay_event_id: string
          retry_count?: number | null
          signature?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          razorpay_event_id?: string
          retry_count?: number | null
          signature?: string | null
        }
        Relationships: []
      }
      wins: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          description: string | null
          emoji: string | null
          id: string
          metric: string | null
          project_id: string
          related_task_id: string | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          metric?: string | null
          project_id: string
          related_task_id?: string | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          metric?: string | null
          project_id?: string
          related_task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "wins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wins_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wins_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      competition_from_kd: { Args: { p_kd: number }; Returns: string }
      current_user_role: { Args: never; Returns: string }
      has_org_access: { Args: { p_org_id: string }; Returns: boolean }
      has_project_access: { Args: { p_project_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      prune_audit_findings: { Args: never; Returns: undefined }
      prune_cwv_snapshots: { Args: never; Returns: undefined }
      prune_pillar_scores: { Args: never; Returns: undefined }
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
