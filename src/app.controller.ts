import { Controller, Injectable, UseGuards, ExecutionContext } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  KafkaContext,
  Payload,
  KafkaRetriableException
} from '@nestjs/microservices';
import { createWriteStream } from 'node:fs'
import * as csv from 'fast-csv'
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

type MyEvent = {
  publishedTimestamp: number
}

@Injectable()
class RcpThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const {
      context,
      limit,
      ttl,
      throttler,
      blockDuration,
      generateKey,
    } = requestProps;

    const ctx = context.switchToRpc().getContext() as KafkaContext
    const topic = ctx.getTopic()
    const partition = ctx.getPartition()
    const tracker = `${topic}-${partition}`
    const key = generateKey(context, tracker, throttler.name);
    const { isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttler.name,
      );

    if (isBlocked) {
      const consumer = ctx.getConsumer()
      consumer.pause([{ topic, partitions: [partition] }])
      setTimeout(async () => {
        const paused = consumer.paused()
        if (paused.find((tp) => tp.topic === topic && tp.partitions.includes(partition))) {
          consumer.resume([{ topic, partitions: [partition] }])
        }
      }, timeToBlockExpire * 1000)

      throw new KafkaRetriableException(`Throttling limit reached on ${topic}:${partition}`)
    }

    return true;
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

  @UseGuards(RcpThrottlerGuard)
  @EventPattern('my_event')
  async handleMyEvent(
    @Payload() event: MyEvent,
    @Ctx() context: KafkaContext
  ) {
    const topic = context.getTopic();
    const partition = context.getPartition();
    const { offset } = context.getMessage();

    try {
      const id = context.getMessage().key
      console.log(`>>> Got message id=${id}`)
      this.csv.write({ published: event.publishedTimestamp, consumed: Date.now(), id})
    } catch (error) {
      console.error(error)
    } finally {
      await context.getConsumer().commitOffsets([
        {
          topic,
          partition,
          offset: (Number(offset) + 1).toString(),
        },
      ]);
    }
  }
}
