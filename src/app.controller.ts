import { Controller, Injectable, UseGuards, ExecutionContext } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  KafkaContext,
  Payload,
  RpcException
} from '@nestjs/microservices';
import { createWriteStream } from 'node:fs'
import * as csv from 'fast-csv'
import { ThrottlerGuard, ThrottlerLimitDetail, ThrottlerRequest } from '@nestjs/throttler';

type MyEvent = {
  publishedTimestamp: number
}

@Injectable()
class RcpThrottlerGuard extends ThrottlerGuard {
  async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new RpcException(await this.getErrorMessage(context, throttlerLimitDetail));
  }

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
    const tracker = ctx.getTopic()
    const key = generateKey(context, tracker, throttler.name);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttler.name,
      );

    if (isBlocked) {
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
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
