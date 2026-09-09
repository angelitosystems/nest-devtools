import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CatsService {
  private readonly logger = new Logger(CatsService.name);
  private readonly cats = [
    { id: 1, name: 'Milo', age: 2 },
    { id: 2, name: 'Otis', age: 4 },
  ];

  findAll(): unknown[] {
    this.logger.log('Fetching all cats');
    return this.cats;
  }

  findOne(id: string): unknown {
    this.logger.log(`Fetching cat ${id}`);
    const cat = this.cats.find((candidate) => candidate.id === Number(id));
    if (!cat) {
      this.logger.warn(`Cat ${id} not found`);
      throw new Error(`Cat #${id} not found`);
    }
    return cat;
  }

  create(payload: { name: string; age: number }): unknown {
    this.logger.log(`Creating cat ${payload.name}`);
    const cat = { id: this.cats.length + 1, ...payload };
    this.cats.push(cat);
    return cat;
  }

  explode(): never {
    this.logger.error('About to throw intentionally');
    throw new TypeError('Cannot read properties of undefined (intentional demo error)');
  }
}
