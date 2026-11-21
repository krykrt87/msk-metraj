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
const itemId = z.string().min(1);
const text = z.string().max(2000);
export const setItemStatusSchema = scope.extend({
  itemId,
  status: z.enum(['kontrol_edildi', 'sorunlu', 'yeniden_kontrol', 'kontrol_edilmedi']),
  note: text.optional(),
});
export const finalizeItemSchema = scope.extend({ itemId });
export const unlockItemSchema = scope.extend({ itemId, reason: z.string() });
export const acknowledgeItemSchema = scope.extend({ itemId, note: text.optional() });
export const createItemSchema = scope.extend({
  poz: z.string(),
  name: z.string().max(500),
  unit: z.string().max(20),
  code: z.string().max(50).nullable().optional(),
  kind: z.enum(['measured', 'derived']),
  value: z.number().nullable().optional(),
  formula: z.string().max(1000).optional(),
  method: text.optional(),
  drawings: z.array(z.string()).max(100).optional(),
  reason: z.string(),
});
export const cancelItemSchema = scope.extend({ itemId, reason: z.string() });
export const updateItemInfoSchema = scope.extend({
  itemId,
  name: z.string().max(500).optional(),
  code: z.string().max(50).nullable().optional(),
  unit: z.string().max(20).optional(),
  method: text.optional(),
  confidence: confidence.optional(),
  drawings: z.array(z.string()).max(100).optional(),
  reason: text.optional(),
});
const optText = z.string().max(500).nullable().optional();
export const updateRoomSchema = scope.extend({
  roomId: z.string().min(1),
  area: z.number().optional(),
  floor: z.string().max(100).optional(),
  ceilingLower: optText,
  ceilingUpper: optText,
  ch: optText,
  flooring: optText,
  note: optText,
  reason: z.string(),
});
export const updateFacadeCellSchema = scope.extend({
  rowId: z.string().min(1),
  column: z.enum(['FM-01', 'FM-02/FM-03', 'FM-04', 'FM-05', 'FS-01', 'FP-01']),
  value: z.number(),
  reason: z.string(),
});
export const setMaterialFormulaSchema = scope.extend({ materialId: z.string().min(1), formula: z.string().max(1000).nullable(), reason: z.string() });
