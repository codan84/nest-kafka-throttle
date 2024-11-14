import { Logger } from '@nestjs/common'
import { InMemoryKafkaThrottlerService } from './throttler.service'

describe('InMemoryKafkaThrottlerService', () => {
  const service = new InMemoryKafkaThrottlerService()

  beforeAll(() => {
    Logger.overrideLogger(['fatal'])

    jest.useFakeTimers()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  afterEach(() => {
    jest.runAllTimers()
  })

  it('called with null values is a no-op and returns null', () => {
    const blockMs = service.increment('topic', null, null)

    expect(blockMs).toBe(null)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('called more times than maxMessages in given sliding window returns block duration in ms', () => {
    let blockMs = null

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(4500)
  })

  it('correctly removes calls from sliding window over time', () => {
    let blockMs = null

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(100)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(4601)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(null)

    jest.advanceTimersByTime(50)

    blockMs = service.increment('topic', 5, 5000)
    expect(blockMs).toBe(49)
  })
})