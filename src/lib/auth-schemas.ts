import { z } from "zod";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(8).max(128);

export const passwordAuthSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign-in"), email: emailSchema, password: passwordSchema }).strict(),
  z.object({ action: z.literal("sign-up"), email: emailSchema, password: passwordSchema }).strict(),
  z.object({ action: z.literal("reset-password"), email: emailSchema }).strict(),
  z.object({ action: z.literal("update-password"), password: passwordSchema }).strict(),
]);
