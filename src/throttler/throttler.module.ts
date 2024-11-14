import { Module, DynamicModule } from '@nestjs/common';

import { InMemoryKafkaThrottlerService, KafkaThrottlerService } from './throttler.service'
import { KAFKA_THROTTLER_OPTIONS } from './constants'
import { KafkaThrottlerOptions, KafkaThrottlerAsyncOptions } from './interfaces'

const KafkaThrottleServiceProvider = {
  provide: KafkaThrottlerService,
  useFactory: () => {
    return new InMemoryKafkaThrottlerService();
  }
}

@Module({})
export class KafkaThrottlerModule {
  static register(options: KafkaThrottlerOptions): DynamicModule {
    const providers = [
      KafkaThrottleServiceProvider,
      {
        provide: KAFKA_THROTTLER_OPTIONS,
        useValue: options
      }
    ]
    return {
      module: KafkaThrottlerModule,
      providers,
      exports: providers
    }
  }

  static registerAsync(options: KafkaThrottlerAsyncOptions): DynamicModule {
    const providers = [
      KafkaThrottleServiceProvider,
      {
        provide: KAFKA_THROTTLER_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      }
    ];
    return {
      module: KafkaThrottlerModule,
      imports: options.imports || [],
      providers,
      exports: providers,
    };
  }
}
