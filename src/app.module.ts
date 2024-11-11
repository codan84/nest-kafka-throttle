import { Module } from '@nestjs/common';
import { AppController, GracefulKafkaThrottlerService } from './app.controller';
import { ConfigModule } from '@nestjs/config';

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
