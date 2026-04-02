/**
 * Domain model types - Auto-generated from backend Pydantic models
 * DO NOT EDIT MANUALLY - Run `npm run generate-types` to regenerate
 */

// Content Classification
export interface ContentClassification {
  content_form: string;
  info_structure: string;
  cognitive_goal: string;
  confidence: number;
}

// Summary models
export interface KeyPoint {
  title: string;
  detail: string;
  evidence: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface ActionItem {
  content: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Risk {
  content: string;
  severity: 'high' | 'medium' | 'low';
}

export interface SummaryResponse {
  version: number;
  language: string;
  overview: string;
  keypoints: KeyPoint[];
  action_items?: ActionItem[];
  risks?: Risk[];
  content_type?: ContentClassification;
}

// Comprehension models
export interface InsightItem {
  title: string;
  new_perspective: string;
  why_it_matters: string;
}

export interface TargetAudience {
  who_benefits: string[];
  who_wont: string[];
}

export interface ComprehensionBriefResponse {
  core_intent: string;
  core_position: string;
  key_insights: InsightItem[];
  what_to_ignore: string[];
  target_audience: TargetAudience;
  reusable_takeaway: string;
}

// Transcript validation
export interface TranscriptValidation {
  is_valid: boolean;
  reason: string;
}
