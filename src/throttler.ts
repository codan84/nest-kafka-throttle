import {
  Injectable,
  ExecutionContext,
  NestInterceptor,
  CallHandler,
  Inject,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KafkaContext,
} from '@nestjs/microservices';
import { Observable, of } from 'rxjs';

@Injectable()
export class GracefulKafkaThrottlerService {
  private slidingWindowMs : number
  private maxMessages : number
  private readonly logger = new Logger('GracefulKafkaThrottlerService')

  private timeoutsPerTopic: Map<string, { timestamp: number, timeout: NodeJS.Timeout }[]> = new Map()

  constructor(configService: ConfigService) {
    this.maxMessages = configService.get('kafkaThrottlerMaxMessages')
    this.slidingWindowMs = configService.get('kafkaThrottlerSlidingWindowMs')
  }

  increment(topic: string): number | null {
    if (!this.timeoutsPerTopic.has(topic)) {
      this.timeoutsPerTopic.set(topic, [])
    }
    const timeouts = this.timeoutsPerTopic.get(topic)
    const context = {
      slidingWindowMs: this.slidingWindowMs,
      maxMessages: this.maxMessages,
      currentMessageCount: timeouts.length,
      topic
    }

    if (timeouts.length >= this.maxMessages) {
      const unblockedInMs = Date.now() - timeouts[0].timestamp
      if (unblockedInMs > 0) {
        this.logger.warn('Throttling', { ...context, unblockedInMs })
        return unblockedInMs
      }
    }

    this.logger.log('Incrementing message count by 1', context)

    const timeout = setTimeout(() => {
      const [ oldest, ...rest ] = this.timeoutsPerTopic.get(topic)
      clearTimeout(oldest.timeout)
      this.timeoutsPerTopic.set(topic, rest)
    }, this.slidingWindowMs)
    timeouts.push({ timestamp: Date.now(), timeout })

    return null
  } 
}

@Injectable()
export class GracefulKafkaThrottler implements NestInterceptor {
  private readonly logger = new Logger('GracefulKafkaThrottler')

  @Inject()
  private storage: GracefulKafkaThrottlerService

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const ctx = context.switchToRpc().getContext() as KafkaContext

    const topic = ctx.getTopic();
    const partition = ctx.getPartition();
    const { offset } = ctx.getMessage();
    const consumer = ctx.getConsumer()

    const blockedMs = this.storage.increment(topic);

    if (blockedMs) {
      this.logger.warn(`Pause consumer for ${topic} for ${blockedMs}ms`)
      consumer.seek({
        topic,
        partition,
        offset: offset,
      })
      consumer.pause([{ topic, partitions: [partition] }])
      setTimeout(async () => {
        this.logger.log(`Unpausing consumer for ${topic}`)
        const paused = consumer.paused()
        if (paused.find((tp) => tp.topic === topic && tp.partitions.includes(partition))) {
          consumer.resume([{ topic, partitions: [partition] }])
        }
      }, blockedMs)
      return of(null)
    }

    return next.handle()
  }
}
