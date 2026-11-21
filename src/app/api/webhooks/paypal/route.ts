import { handleWebhook } from "@/server/payments/webhook-route";

export async function POST(req: Request) {
  return handleWebhook("paypal", req);
}
