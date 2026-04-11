import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://aveitrccxqbjfxysogiv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2ZWl0cmNjeHFiamZ4eXNvZ2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTE1NzAsImV4cCI6MjA5MTQ4NzU3MH0.mIoMMte12VPxAxC8_UHmiYe2hX3UygSCxdhAd0LSHJw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
