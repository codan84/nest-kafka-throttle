import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaThrottlerModule } from './throttler'

const config = () => ({
  kafkaThrottlerSlidingWindowMs: 5000,
  kafkaThrottlerMaxMessages: 7
})

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [config],
      isGlobal: true,
    }),
    KafkaThrottlerModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        maxMessages: config.get('kafkaThrottlerMaxMessages'),
        slidingWindowMs: config.get('kafkaThrottlerSlidingWindowMs'),
      })
    })
  ],
  controllers: [AppController]
})
export class AppModule {}
