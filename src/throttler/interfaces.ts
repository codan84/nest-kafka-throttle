import { ModuleMetadata } from '@nestjs/common';

export interface KafkaThrottlerOptions {
  maxMessages?: number,
  slidingWindowMs?: number
}

export interface KafkaThrottlerAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => Promise<KafkaThrottlerOptions> | KafkaThrottlerOptions;
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  inject: any[];
}
