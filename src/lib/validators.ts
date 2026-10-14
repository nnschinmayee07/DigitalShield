import { z } from "zod";
export const identityKind = z.enum(["email", "social_profile", "website", "username", "phone", "other"]);
export const sourceStatus = z.enum(["unverified", "authorized", "disabled"]);
export const findingStatus = z.enum(["open", "resolved", "dismissed"]);
export const createIdentitySchema = z.object({
  label: z.string().trim().min(1).max(120), kind: identityKind.default("other"),
  identifier: z.string().trim().min(1).max(2048), privateNotes: z.string().max(10000).optional().nullable(),
}).strict();
export const updateIdentitySchema = z.object({
  label: z.string().trim().min(1).max(120).optional(), kind: identityKind.optional(),
  identifier: z.string().trim().min(1).max(2048).optional(), privateNotes: z.string().max(10000).optional().nullable(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
export const createSourceSchema = z.object({ name: z.string().trim().min(1).max(120), reference: z.string().trim().min(1).max(2048) }).strict();
export const updateSourceSchema = z.object({ status: sourceStatus, authorizationNote: z.string().trim().max(1000).optional().nullable() }).strict();
export const updateFindingSchema = z.object({ status: findingStatus }).strict();
