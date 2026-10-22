import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { customerInputSchema, householdMemberSchema } from '@measuremate/validation';
import { Perm, Validates, ValidatesQuery } from '../../common/decorators';
import { Q, paginationShape, paged } from '../../common/query';
import { CustomersService } from './customers.service';

const searchQuery = z.object({
  q: z.string().max(100).optional(), city: z.string().max(100).optional(), postalCode: z.string().max(20).optional(),
  tag: z.string().max(40).optional(), status: z.enum(['ACTIVE', 'ARCHIVED', 'MERGED']).optional(), branchId: z.string().uuid().optional(),
  nearLat: z.coerce.number().min(-90).max(90).optional(), nearLng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(500).optional(), ...paginationShape,
});
const updateSchema = customerInputSchema.partial().extend({ version: z.number().int().positive() });
const consentSchema = z.object({ channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP']), purpose: z.enum(['TRANSACTIONAL', 'MARKETING', 'GREETINGS']), granted: z.boolean() });
const mergeSchema = z.object({ sourceId: z.string().uuid() });

@ApiTags('Customers')
@Controller()
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Post('customers') @Perm('customer.create') @Validates(customerInputSchema)
  create(@Body() body: z.infer<typeof customerInputSchema>, @Query('force') force?: string) {
    return this.svc.create(body, force === 'true');
  }

  @Get('customers') @Perm('customer.view') @ValidatesQuery(searchQuery)
  async search(@Q() q: z.infer<typeof searchQuery>) {
    const r = await this.svc.search(q);
    return paged(r.data, r.total, q.page, q.pageSize);
  }

  @Get('customers/recent') @Perm('customer.view')
  recent() { return this.svc.recent(); }

  @Get('customers/export') @Perm('customer.export')
  async export(@Res() res: Response) {
    const csv = await this.svc.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send('﻿' + csv);
  }

  @Get('customers/:id') @Perm('customer.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }

  @Patch('customers/:id') @Perm('customer.update') @Validates(updateSchema)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: z.infer<typeof updateSchema>) { return this.svc.update(id, body); }

  @Post('customers/:id/archive') @Perm('customer.archive') @HttpCode(200)
  archive(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setStatus(id, 'ARCHIVED'); }

  @Post('customers/:id/restore') @Perm('customer.archive') @HttpCode(200)
  restore(@Param('id', ParseUUIDPipe) id: string) { return this.svc.setStatus(id, 'ACTIVE'); }

  @Post('customers/:id/merge') @Perm('customer.merge') @HttpCode(200) @Validates(mergeSchema)
  merge(@Param('id', ParseUUIDPipe) id: string, @Body() body: z.infer<typeof mergeSchema>) { return this.svc.merge(id, body.sourceId); }

  @Get('customers/:id/timeline') @Perm('customer.view')
  timeline(@Param('id', ParseUUIDPipe) id: string) { return this.svc.timeline(id); }

  @Put('customers/:id/consents') @Perm('customer.update') @Validates(consentSchema)
  consent(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof consentSchema>) { return this.svc.setConsent(id, b.channel, b.purpose, b.granted); }

  @Post('customers/:id/members') @Perm('customer.update') @Validates(householdMemberSchema)
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof householdMemberSchema>) { return this.svc.addMember(id, b); }

  @Patch('members/:memberId') @Perm('customer.update') @Validates(householdMemberSchema.partial())
  updateMember(@Param('memberId', ParseUUIDPipe) id: string, @Body() b: Partial<z.infer<typeof householdMemberSchema>>) { return this.svc.updateMember(id, b); }

  @Delete('members/:memberId') @Perm('customer.update')
  archiveMember(@Param('memberId', ParseUUIDPipe) id: string) { return this.svc.archiveMember(id); }
}
