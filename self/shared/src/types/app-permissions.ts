import { z } from 'zod';

export const AppWitnessLevelSchema = z.enum(['action', 'session', 'none']);
export type AppWitnessLevel = z.infer<typeof AppWitnessLevelSchema>;

export const AppPermissionsSchema = z.object({
  network: z.array(z.string().min(1)).default([]),
  credentials: z.boolean().default(false),
  witnessLevel: AppWitnessLevelSchema.default('none'),
  systemNotify: z.boolean().default(false),
  memoryContribute: z.boolean().default(false),
});
export type AppPermissions = z.infer<typeof AppPermissionsSchema>;
