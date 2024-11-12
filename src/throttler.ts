import {
  Injectable,
  ExecutionContext,
  NestInterceptor,
  CallHandler,
  Inject,
  Logger,
  Module,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KafkaContext,
} from '@nestjs/microservices';
import { Observable, of } from 'rxjs';

@Injectable()
class KafkaThrottlerService {
  private readonly logger = new Logger('KafkaThrottlerService')

  private timeoutsPerTopic: Map<string, { timestamp: number, timeout: NodeJS.Timeout }[]> = new Map()

  increment(topic: string, maxMessages: number, slidingWindowMs: number): number | null {
    if (maxMessages === null || slidingWindowMs === null) {
      return null
    }

    if (!this.timeoutsPerTopic.has(topic)) {
      this.timeoutsPerTopic.set(topic, [])
    }
    const timeouts = this.timeoutsPerTopic.get(topic)
    const context = {
      slidingWindowMs: slidingWindowMs,
      maxMessages: maxMessages,
      currentMessageCount: timeouts.length,
      topic
    }

    if (timeouts.length >= maxMessages) {
      const unblockedInMs = Date.now() - timeouts[0].timestamp
      if (unblockedInMs > 0) {
        this.logger.debug('Throttling', { ...context, unblockedInMs })
        return unblockedInMs
      }
    }

    this.logger.debug('Incrementing message count by 1', context)

    const timeout = setTimeout(() => {
      const [ oldest, ...rest ] = this.timeoutsPerTopic.get(topic)
      clearTimeout(oldest.timeout)
      this.timeoutsPerTopic.set(topic, rest)
    }, slidingWindowMs)
    timeouts.push({ timestamp: Date.now(), timeout })

    return null
  } 
}

@Injectable()
export class KafkaThrottler implements NestInterceptor {
  private readonly logger = new Logger('KafkaThrottler')

  private slidingWindowMs : number | null
  private maxMessages : number | null

  constructor(configService: ConfigService) {
    this.maxMessages = configService.get('kafkaThrottlerMaxMessages', null)
    this.slidingWindowMs = configService.get('kafkaThrottlerSlidingWindowMs', null)
  }

  @Inject()
  private storage: KafkaThrottlerService

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<void>> {
    if (this.maxMessages && this.slidingWindowMs) {
      const ctx = context.switchToRpc().getContext() as KafkaContext

      const topic = ctx.getTopic();
      const partition = ctx.getPartition();
      const { offset } = ctx.getMessage();
      const consumer = ctx.getConsumer()

      const blockedMs = this.storage.increment(topic, this.maxMessages, this.slidingWindowMs);

      if (blockedMs) {
        this.logger.debug(`Pause consumer for ${topic}:${partition} for ${blockedMs}ms`)
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

@Module({
  providers: [
    KafkaThrottlerService
  ],
  exports: [
    KafkaThrottlerService
  ]
})
export class KafkaThrottlerModule {}
