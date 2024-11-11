import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { GracefulKafkaThrottlerService } from './throttler'

const config = () => ({
  kafkaThrottlerSlidingWindowMs: 5000,
  kafkaThrottlerMaxMessages: 7
})

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [config],
      isGlobal: true,
    })
  ],
  providers: [
    GracefulKafkaThrottlerService
  ],
  controllers: [AppController]
})
export class AppModule {}
