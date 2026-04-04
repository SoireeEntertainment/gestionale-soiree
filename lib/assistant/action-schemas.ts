import { z } from 'zod'

export const createClientPayloadSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const createClientCredentialPayloadSchema = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const updateClientCredentialPayloadSchema = z.object({
  credentialId: z.string().min(1),
  clientId: z.string().min(1),
  label: z.string().min(1),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const createWorkPayloadSchema = z.object({
  title: z.string().min(1),
  clientId: z.string().min(1),
  categoryId: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z
    .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'DONE', 'PAUSED', 'CANCELED'])
    .optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().nullable(),
  deadline: z.string().optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
})

export const updateWorkPayloadSchema = z.object({
  workId: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  status: z
    .enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'DONE', 'PAUSED', 'CANCELED'])
    .optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().nullable(),
  deadline: z.string().optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
})

export const createWorkStepPayloadSchema = z.object({
  workId: z.string().min(1),
  title: z.string().min(1),
})

export const updateWorkStepPayloadSchema = z.object({
  stepId: z.string().min(1),
  title: z.string().optional(),
  status: z.enum(['TODO', 'DONE', 'BLOCKED']).optional(),
})

export const createClientRenewalPayloadSchema = z.object({
  clientId: z.string().min(1),
  serviceName: z.string().min(1),
  renewalDate: z.string().min(1),
  billingDate: z.string().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
})

export const updateClientRenewalPayloadSchema = z.object({
  renewalId: z.string().min(1),
  clientId: z.string().min(1),
  serviceName: z.string().min(1),
  renewalDate: z.string().min(1),
  billingDate: z.string().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
})

export const createPedTaskPayloadSchema = z.object({
  clientId: z.string().min(1),
  date: z.string().min(1),
  kind: z.enum(['CONTENT', 'WORK_TASK']),
  type: z.enum([
    'REEL',
    'POST',
    'STORY',
    'CAROUSEL',
    'ADV',
    'SHOOTING',
    'WEBSITE_TASK',
    'GRAPHIC_TASK',
    'COPY_TASK',
    'MEETING',
    'OTHER',
  ]),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(['NOT_URGENT', 'MEDIUM', 'URGENT']).optional(),
  label: z
    .enum(['IN_APPROVAZIONE', 'DA_FARE', 'PRONTO_NON_PUBBLICATO', 'FATTO'])
    .optional(),
  workId: z.string().optional().nullable(),
  isExtra: z.boolean().optional(),
  assignedToUserId: z.string().optional().nullable(),
  platforms: z.array(z.enum(['INSTAGRAM', 'LINKEDIN', 'TIKTOK'])).optional(),
})

export const updatePedTaskPayloadSchema = z.object({
  pedItemId: z.string().min(1),
  date: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['TODO', 'DONE']).optional(),
  label: z
    .enum(['IN_APPROVAZIONE', 'DA_FARE', 'PRONTO_NON_PUBBLICATO', 'FATTO'])
    .optional(),
  priority: z.enum(['NOT_URGENT', 'MEDIUM', 'URGENT']).optional(),
  type: z
    .enum([
      'REEL',
      'POST',
      'STORY',
      'CAROUSEL',
      'ADV',
      'SHOOTING',
      'WEBSITE_TASK',
      'GRAPHIC_TASK',
      'COPY_TASK',
      'MEETING',
      'OTHER',
    ])
    .optional(),
})
