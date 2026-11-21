import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

const handler = () => toNextJsHandler(getAuth());

export async function GET(req: Request) {
  return handler().GET(req);
}
export async function POST(req: Request) {
  return handler().POST(req);
}
