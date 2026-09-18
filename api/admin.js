import { handleAdminRequest } from "../lib/admin/handler.js";

// Vercel function behind /admin (see the rewrites in vercel.json) and the
// admin JSON API at /api/admin. Authentication happens inside the handler.
export function GET(request) {
  return handleAdminRequest(request);
}

export function POST(request) {
  return handleAdminRequest(request);
}
