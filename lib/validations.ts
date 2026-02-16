import { z } from 'zod'

export const clientSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  contactName: z.string().optional(),
  email: z.string().email('Email non valida').optional().or(z.literal('')),
  phone: z.string().optional(),
  notes: z.string().optional(),
  assignedToUserId: z.string().optional().nullable(),
  metaBusinessSuiteUrl: z.union([z.string().url('URL non valido'), z.literal('')]).optional().default(''),
  gestioneInserzioniUrl: z.union([z.string().url('URL non valido'), z.literal('')]).optional().default(''),
})

export const categorySchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  description: z.string().optional(),
})

export const workSchema = z.object({
  title: z.string().min(1, 'Il titolo è obbligatorio'),
  description: z.string().optional(),
  clientId: z.string().min(1, 'Il cliente è obbligatorio'),
  categoryId: z.string().min(1, 'La categoria è obbligatoria'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'DONE', 'PAUSED', 'CANCELED']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  deadline: z.string().optional().or(z.literal('')),
  assignedToUserId: z.string().optional().nullable(),
})

export const clientCategorySchema = z.object({
  clientId: z.string().min(1),
  categoryId: z.string().min(1),
  status: z.enum(['NOT_ACTIVE', 'ACTIVE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED']),
  notes: z.string().optional(),
})

export const preventivoItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  order: z.number().int().min(0).optional(),
})

export const preventivoSchema = z.object({
  clientId: z.string().min(1, 'Cliente obbligatorio'),
  title: z.string().min(1, 'Titolo obbligatorio'),
  type: z.enum(['GENERATED', 'UPLOADED']),
  status: z.enum(['BOZZA', 'INVIATO', 'ACCETTATO', 'RIFIUTATO']).optional(),
  totalAmount: z.number().optional().nullable(),
  notes: z.string().optional(),
  items: z.array(preventivoItemSchema).optional(),
})

// PED (Piano Editoriale)
export const PED_ITEM_KINDS = ['CONTENT', 'WORK_TASK'] as const
export const PED_ITEM_TYPES = ['REEL', 'POST', 'STORY', 'CAROUSEL', 'ADV', 'SHOOTING', 'WEBSITE_TASK', 'GRAPHIC_TASK', 'COPY_TASK', 'MEETING', 'OTHER'] as const
export const PED_PRIORITIES = ['NOT_URGENT', 'MEDIUM', 'URGENT'] as const
export const PED_STATUSES = ['TODO', 'DONE'] as const

export const pedClientSettingSchema = z.object({
  clientId: z.string().min(1),
  contentsPerWeek: z.number().int().min(0),
})

export const pedItemCreateSchema = z.object({
  clientId: z.string().min(1),
  date: z.string().min(1),
  kind: z.enum(PED_ITEM_KINDS),
  type: z.enum(PED_ITEM_TYPES),
  title: z.string().min(1, 'Titolo obbligatorio'),
  description: z.string().optional().nullable(),
  priority: z.enum(PED_PRIORITIES),
  workId: z.string().optional().nullable(),
  isExtra: z.boolean().optional(),
  assignedToUserId: z.string().optional().nullable(),
})

export const pedItemUpdateSchema = pedItemCreateSchema.partial().extend({
  status: z.enum(PED_STATUSES).optional(),
})

