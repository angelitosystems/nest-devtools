import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CatsService } from './cats.service';

@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Get()
  findAll(@Query('page') _page?: string) {
    return this.catsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.catsService.findOne(id);
  }

  @Post()
  create(@Body() body: { name: string; age: number }) {
    return this.catsService.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    void id;
    return { removed: true };
  }
}
