import { Injectable, Logger } from '@nestjs/common';

export interface KafkaThrottlerService {
  increment(topic: string, maxMessages: number | null, slidingWindowMs: number| null): number | null
}
export const KafkaThrottlerService = Symbol('KafkaThrottlerService')

@Injectable()
export class InMemoryKafkaThrottlerService implements KafkaThrottlerService {
  private readonly logger = new Logger('KafkaThrottlerService')

  private timeoutsPerTopic: Map<string, { timestamp: number, timeout: NodeJS.Timeout }[]> = new Map()

  increment(topic: string, maxMessages: number | null, slidingWindowMs: number | null): number | null {
    if (maxMessages === null || slidingWindowMs === null) {
      return null
    }

    if (!this.timeoutsPerTopic.has(topic)) {
      this.timeoutsPerTopic.set(topic, [])
    }
    const timeouts = this.timeoutsPerTopic.get(topic) || []
    const context = {
      slidingWindowMs: slidingWindowMs,
      maxMessages: maxMessages,
      currentMessageCount: timeouts.length,
      topic
    }

    if (timeouts.length >= maxMessages) {
      const unblockedInMs = timeouts[0].timestamp + slidingWindowMs - Date.now()
      if (unblockedInMs > 0) {
        this.logger.debug('Throttling', { ...context, unblockedInMs })
        return unblockedInMs
      }
    }

    this.logger.debug('Incrementing message count by 1', context)

    const timeout = setTimeout(() => {
      const [ oldest, ...rest ] = this.timeoutsPerTopic.get(topic) || []
      if (oldest) {
        clearTimeout(oldest.timeout)
        this.timeoutsPerTopic.set(topic, rest)
      }
    }, slidingWindowMs)
    timeouts.push({ timestamp: Date.now(), timeout })

    return null
  } 
}
