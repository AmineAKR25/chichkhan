import { handleMenuRequest } from "../lib/handler.js";

// Vercel function behind the /restaurant and /cafe rewrites in vercel.json.
export async function GET(request) {
  const venue = new URL(request.url).searchParams.get("venue");
  const { status, headers, body } = await handleMenuRequest(venue);
  return new Response(body, { status, headers });
}
