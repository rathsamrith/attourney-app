import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../auth/decorators.js';
import { DocketQuery, DocketWeekDto, MetricDto, MetricsQuery } from './docket.dto.js';
import { DocketService } from './docket.service.js';

@Controller('docket')
@Roles('officer')
export class DocketController {
  constructor(private readonly docket: DocketService) {}

  @Get()
  @ApiOkResponse({ type: DocketWeekDto })
  week(@Query() q: DocketQuery) {
    return this.docket.week(q.weekOf ? new Date(q.weekOf) : new Date());
  }

  /** Defaults to the last 30 days. */
  @Get('metrics')
  @ApiOkResponse({ type: [MetricDto] })
  metrics(@Query() q: MetricsQuery) {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86_400_000);
    return this.docket.metrics(from, to);
  }
}
