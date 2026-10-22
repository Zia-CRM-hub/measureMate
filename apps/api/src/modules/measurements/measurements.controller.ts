import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { fromCanonicalMm, LengthUnit, revisionInputSchema, templateSchema } from '@measuremate/validation';
import { Perm, Validates } from '../../common/decorators';
import { hexToRgb, renderPdf } from '../../common/pdf';
import { MeasurementsService } from './measurements.service';

const unitOf = (u?: string): LengthUnit | undefined => (u === 'cm' || u === 'in' ? u : undefined);
const profileSchema = z.object({ templateId: z.string().uuid(), name: z.string().trim().max(100).optional(), copyFromProfileId: z.string().uuid().optional() });
const restoreSchema = z.object({ revisionNo: z.number().int().positive(), reason: z.string().trim().min(3).max(500) });
const cloneSchema = z.object({ name: z.string().trim().min(2).max(100).optional() });

@ApiTags('Measurements')
@Controller()
export class MeasurementsController {
  constructor(private readonly svc: MeasurementsService) {}

  @Get('measurement-templates') @Perm('measurement.view')
  templates(@Query('includeArchived') inc?: string) { return this.svc.listTemplates(inc === 'true'); }

  @Get('measurement-templates/:id') @Perm('measurement.view')
  template(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getTemplate(id); }

  @Post('measurement-templates') @Perm('measurement.template.manage') @Validates(templateSchema)
  createTemplate(@Body() b: z.infer<typeof templateSchema>) { return this.svc.createTemplate(b); }

  @Post('measurement-templates/:id/clone') @Perm('measurement.template.manage') @HttpCode(201) @Validates(cloneSchema)
  clone(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof cloneSchema>) { return this.svc.cloneTemplate(id, b.name); }

  @Put('measurement-templates/:id') @Perm('measurement.template.manage') @Validates(templateSchema)
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof templateSchema>) { return this.svc.updateTemplate(id, b); }

  @Delete('measurement-templates/:id') @Perm('measurement.template.manage')
  archiveTemplate(@Param('id', ParseUUIDPipe) id: string) { return this.svc.archiveTemplate(id); }

  @Get('members/:memberId/measurement-profiles') @Perm('measurement.view')
  profiles(@Param('memberId', ParseUUIDPipe) id: string) { return this.svc.listProfiles(id); }

  @Post('members/:memberId/measurement-profiles') @Perm('measurement.create') @Validates(profileSchema)
  createProfile(@Param('memberId', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof profileSchema>) { return this.svc.createProfile(id, b); }

  @Get('measurement-profiles/:id') @Perm('measurement.view')
  profile(@Param('id', ParseUUIDPipe) id: string, @Query('unit') unit?: string) { return this.svc.getProfile(id, unitOf(unit)); }

  @Post('measurement-profiles/:id/revisions') @Perm('measurement.create') @Validates(revisionInputSchema)
  revise(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof revisionInputSchema>) { return this.svc.createRevision(id, b); }

  @Get('measurement-profiles/:id/revisions') @Perm('measurement.view')
  revisions(@Param('id', ParseUUIDPipe) id: string) { return this.svc.listRevisions(id); }

  @Get('measurement-profiles/:id/revisions/:no') @Perm('measurement.view')
  revision(@Param('id', ParseUUIDPipe) id: string, @Param('no', ParseIntPipe) no: number, @Query('unit') unit?: string) {
    return this.svc.getRevision(id, no, unitOf(unit));
  }

  @Get('measurement-profiles/:id/compare') @Perm('measurement.view')
  compare(@Param('id', ParseUUIDPipe) id: string, @Query('from', ParseIntPipe) from: number, @Query('to', ParseIntPipe) to: number, @Query('unit') unit?: string) {
    return this.svc.compare(id, from, to, unitOf(unit));
  }

  @Post('measurement-profiles/:id/restore') @Perm('measurement.restore') @HttpCode(200) @Validates(restoreSchema)
  restore(@Param('id', ParseUUIDPipe) id: string, @Body() b: z.infer<typeof restoreSchema>) { return this.svc.restore(id, b.revisionNo, b.reason); }

  @Get('measurement-profiles/:id/sheet.pdf') @Perm('measurement.view')
  async sheet(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response, @Query('unit') unit?: string) {
    const { detail, customer, tenant } = await this.svc.sheetData(id, unitOf(unit));
    const u = detail.unit;
    const [r, g, b] = hexToRgb(tenant.settings?.brandColor ?? '#0f766e');
    const pdf = await renderPdf((doc) => {
      doc.fillColor([r, g, b]).fontSize(20).text(tenant.name);
      doc.fillColor('#444').fontSize(10).text('Measurement sheet').moveDown(0.5);
      doc.fillColor('#000').fontSize(12).text(`${detail.member.fullName}  (${customer.customerNumber} · ${customer.fullName})`);
      doc.fontSize(10).fillColor('#444').text(`${detail.name} · Revision ${detail.latest?.revisionNo ?? '-'} · Units: ${u} · Printed ${new Date().toLocaleDateString()}`).moveDown();
      for (const s of detail.template?.sections ?? []) {
        doc.fillColor([r, g, b]).fontSize(12).text(s.name).moveDown(0.2);
        for (const f of s.fields) {
          const v = detail.latest?.values[f.key];
          doc.fillColor('#000').fontSize(11).text(`${f.label}`, { continued: true, width: 300 }).text(v ? `   ${fromCanonicalMm(v.canonicalMm, u)} ${u}` : '   —');
        }
        doc.moveDown(0.6);
      }
      const styles = Object.entries(detail.latest?.styles ?? {});
      if (styles.length) { doc.fillColor([r, g, b]).fontSize(12).text('Style preferences').moveDown(0.2); for (const [k, v] of styles) doc.fillColor('#000').fontSize(11).text(`${k}: ${v}`); doc.moveDown(0.6); }
      if (detail.latest?.postureNotes) doc.fillColor('#000').fontSize(11).text(`Posture: ${detail.latest.postureNotes}`);
      if (detail.latest?.fitNotes) doc.fillColor('#000').fontSize(11).text(`Fit: ${detail.latest.fitNotes}`);
      doc.moveDown().fillColor('#777').fontSize(8).text('Values are stored in millimetres and converted for display (1 in = 25.4 mm). Range checks are rule-based, not AI.');
    }, { title: `Measurements - ${detail.member.fullName}` });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="measurements-${customer.customerNumber}.pdf"`);
    res.send(pdf);
  }
}
