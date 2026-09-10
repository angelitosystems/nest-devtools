import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestDevTools } from '@angelitosystems/nest-devtools';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Enable snapshot if you still want graph introspection
    // snapshot: true,
  });

  // ──────────────────────────────────────────────
  // ONLY THIS LINE IS NEEDED
  // No more "nest-devtools start" in a separate terminal
  // ──────────────────────────────────────────────
  await NestDevTools.init(app, {
    // port: 4317,           // optional
    // wsPort: 4318,         // optional
    // openDashboard: true,  // optional – opens browser automatically
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
