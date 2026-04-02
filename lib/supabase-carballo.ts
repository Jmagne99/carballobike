import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://icxlsnizqsidwvdgodoe.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_AybOZ_V6FATCVMt5BJv6qw_mjKdWs1f";

export const supabaseCarballo = createClient(url, key);
