import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { createClientForMatchingProject, isSupabaseConfigForProject } from "./supabase-config-validation.js";

const config = window.ONLY_DJS_SUPABASE_CONFIG || {};
export const supabaseConfigured = Boolean(config.url && config.publishableKey);
export const supabaseConfigMatchesProject = isSupabaseConfigForProject(config);
export const supabase = createClientForMatchingProject(config, createClient);
