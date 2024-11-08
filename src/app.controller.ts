import { Controller, UseGuards } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  KafkaContext,
  Payload,
} from '@nestjs/microservices';
import { createWriteStream } from 'node:fs'
import * as csv from 'fast-csv'
import { ThrottlerGuard } from '@nestjs/throttler';

type MyEvent = {
  publishedTimestamp: number
}

@Controller()
export class AppController {
  private csv: csv.CsvFormatterStream<csv.FormatterRow, csv.FormatterRow>

  constructor() {
    const file = createWriteStream('/app/outputs/consumer.csv')
    this.csv = csv.format({ headers: true })
    this.csv.pipe(file).on('end', () => file.close())
  }

  @UseGuards(ThrottlerGuard)
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
