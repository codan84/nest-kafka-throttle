import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';

@Module({
  imports: [
    // 2 messages every 5 seconds
    ThrottlerModule.forRoot([{
      ttl: 5000,
      limit: 2,
    }])
  ],
  controllers: [AppController]
})
export class AppModule {}
