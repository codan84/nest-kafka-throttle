import { Controller } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  KafkaContext,
  Payload,
} from '@nestjs/microservices';

type MyEvent = {
  publishedTimestamp: number
}

@Controller()
export class AppController {
  @EventPattern('my_event')
  async handleMyEvent(
    @Payload() event: MyEvent,
    @Ctx() context: KafkaContext
  ) {
    const topic = context.getTopic();
    const partition = context.getPartition();
    const { offset } = context.getMessage();

    try {
      console.log('=======================================================')
      console.log(`>>> PROCESSED: ${new Date().toISOString()}`)
      console.log(`>>> PUBLISHED: ${new Date(event.publishedTimestamp).toISOString()}`)
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
