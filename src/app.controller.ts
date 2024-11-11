import {
  Controller,
  Injectable,
  ExecutionContext,
  NestInterceptor,
  CallHandler,
  UseInterceptors,
  Inject
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Ctx,
  EventPattern,
  KafkaContext,
  Payload
} from '@nestjs/microservices';
import { createWriteStream } from 'node:fs'
import * as csv from 'fast-csv'
import { Observable, of } from 'rxjs';

type MyEvent = {
  publishedTimestamp: number
}

@Injectable()
export class GracefulKafkaThrottlerService {
  private slidingWindowMs : number
  private maxMessages : number

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

    const timeout = setTimeout(() => {
      const [ oldest, ...rest ] = this.timeoutsPerTopic.get(topic)
      clearTimeout(oldest.timeout)
      this.timeoutsPerTopic.set(topic, rest)
    }, this.slidingWindowMs)
    timeouts.push({ timestamp: Date.now(), timeout })

    if (timeouts.length >= this.maxMessages) {
      const unblockedInMs = Date.now() - timeouts[0].timestamp
      if (unblockedInMs > 0) {
        return unblockedInMs
      } else {
        return null
      }
    }

    return null
  } 
}

@Injectable()
export class GracefulKafkaThrottler implements NestInterceptor {
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
      console.log(`>>pause for ${blockedMs}`)
      consumer.seek({
        topic,
        partition,
        offset: offset,
      })
      consumer.pause([{ topic, partitions: [partition] }])
      setTimeout(async () => {
        console.log('>>unpause')
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

@Controller()
export class AppController {
  private csv: csv.CsvFormatterStream<csv.FormatterRow, csv.FormatterRow>

  constructor() {
    const file = createWriteStream('/app/outputs/consumer.csv')
    this.csv = csv.format({ headers: true })
    this.csv.pipe(file).on('end', () => file.close())
  }

  @UseInterceptors(GracefulKafkaThrottler)
  @EventPattern('my_event')
  async handleMyEvent(
    @Payload() event: MyEvent,
    @Ctx() context: KafkaContext
  ) {
    const topic = context.getTopic();
    const partition = context.getPartition();
    const { offset } = context.getMessage();
    const consumer = context.getConsumer()

    try {
      const id = context.getMessage().key
      console.log(`>>> Got message id=${id}`)
      this.csv.write({ published: event.publishedTimestamp, consumed: Date.now(), id})
    } catch (error) {
      console.error(error)
    } finally {
      await consumer.commitOffsets([
        {
          topic,
          partition,
          offset: (Number(offset) + 1).toString(),
        },
      ]);
    }
  }
}
