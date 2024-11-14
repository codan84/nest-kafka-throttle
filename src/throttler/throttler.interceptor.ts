import {
  Injectable,
  ExecutionContext,
  NestInterceptor,
  CallHandler,
  Inject,
  Logger,
} from '@nestjs/common';
import {
  KafkaContext,
} from '@nestjs/microservices';
import { Observable, of } from 'rxjs';

import { KafkaThrottlerService } from './throttler.service'
import { KafkaThrottlerOptions } from './interfaces';
import { KAFKA_THROTTLER_OPTIONS } from './constants';

@Injectable()
export class KafkaThrottler implements NestInterceptor {
  private readonly logger = new Logger('KafkaThrottler')

  private storage: KafkaThrottlerService
  private slidingWindowMs : number | null
  private maxMessages : number | null

  constructor(
    @Inject(KAFKA_THROTTLER_OPTIONS) opts: KafkaThrottlerOptions,
    @Inject(KafkaThrottlerService) storage: KafkaThrottlerService
  ) {
    this.maxMessages = opts.maxMessages || null
    this.slidingWindowMs = opts.slidingWindowMs || null

    this.storage = storage
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (this.maxMessages && this.slidingWindowMs) {
      const ctx = context.switchToRpc().getContext() as KafkaContext

      const topic = ctx.getTopic();
      const partition = ctx.getPartition();
      const { offset } = ctx.getMessage();
      const consumer = ctx.getConsumer()

      const blockedMs = this.storage.increment(topic, this.maxMessages, this.slidingWindowMs);

      if (blockedMs) {
        this.logger.debug(`Pause consumer for ${topic}:${partition} for ${blockedMs}ms`)
        
        // > Committing offsets does not change what message we'll consume next once we've started consuming,
        // > but instead is only used to determine from which place to start.
        // > To immediately change from what offset you're consuming messages, you'll want to seek, instead.
        // https://kafka.js.org/docs/consuming#a-name-manual-commits-a-manual-committing
        //
        // Since this message is already being `processed` but we want to ignore it now and replay it later, we need to `seek` back to it.
        consumer.seek({
          topic,
          partition,
          offset: offset,
        })
        consumer.pause([{ topic, partitions: [partition] }])
        setTimeout(async () => {
          this.logger.debug(`Unpause consumer for ${topic}:${partition}`)
          const paused = consumer.paused()
          if (paused.find((tp) => tp.topic === topic && tp.partitions.includes(partition))) {
            consumer.resume([{ topic, partitions: [partition] }])
          }
        }, blockedMs)
        return of(null)
      }
    }

    return next.handle()
  }
}
