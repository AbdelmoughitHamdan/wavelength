import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";

export function newPlayerToken() {
  return randomBytes(32).toString("hex");
}
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function getPlayerToken(request: NextRequest, code: string) {
  return request.cookies.get(`hwdym_${code.toUpperCase()}`)?.value;
}
