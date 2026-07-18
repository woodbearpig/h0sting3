import axios from "axios";

// Relative "/api" so the app works on ANY domain with no rebuild.
// Frontend and backend are same-origin (ingress / Nginx proxies /api).
export const API = "/api";

const api = axios.create({ baseURL: API, withCredentials: true });

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
