import { z } from 'zod';

export const scope = z.object({ projectId: z.string().min(1), discipline: z.string().min(1) });
const confidence = z.enum(['Yüksek', 'Orta', 'Düşük']).nullable();

export const correctItemSchema = scope.extend({
  itemId: z.string().min(1),
  value: z.number(),
  confidence: confidence.optional(),
  reason: z.string(),
});
export const setItemFormulaSchema = scope.extend({ itemId: z.string().min(1), formula: z.string(), reason: z.string() });
