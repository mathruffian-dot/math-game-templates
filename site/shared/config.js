// 由 Agent 填入。兩個值都是「可公開」的設定（publishable key 受 RLS 保護），不是密碼。
// 留空 = 本機模式：資料只存在這台電腦，可用多個分頁測試對戰。
// 絕對不要把 secret key / service_role key 放進任何前端檔案。
export const SUPABASE_URL = '';
export const SUPABASE_PUBLISHABLE_KEY = '';
