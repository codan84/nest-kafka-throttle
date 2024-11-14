import { Logger, ExecutionContext, CallHandler } from '@nestjs/common'
import { KafkaContext } from '@nestjs/microservices'
import { createMock } from '@golevelup/ts-jest';

import { KafkaThrottlerService } from './throttler.service'
import { KafkaThrottler } from './throttler.interceptor'

const getMockExecutionContext = (
  topic: string = 'test-topic',
  partition: number = 1,
  offset: string = '1',
  pausedPartitions: {partitions: number[], topic: string}[] = []
) => {
  const mockConsumer = {
    paused: jest.fn().mockReturnValue(pausedPartitions),
    seek: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn()
  }

  const mockKafkaContext = createMock<KafkaContext>({
    getTopic: () => topic,
    getPartition: () => partition,
    getMessage: () => ({
      offset
    }),
    getConsumer: () => mockConsumer
  })

  const mockExecutionContext = createMock<ExecutionContext>({
    switchToRpc: () => ({
      getContext: () => mockKafkaContext
    })
  })

  return { mockExecutionContext, mockKafkaContext, mockConsumer }
}

describe('KafkaThrottler', () => {
  const mockIncrement = jest.fn()
  const service: KafkaThrottlerService = {
    increment: mockIncrement
  }

  const mockHandler = createMock<CallHandler>()

  beforeAll(() => {
    Logger.overrideLogger(['fatal'])
    jest.useFakeTimers()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  afterEach(() => {
    jest.runAllTimers()
    jest.resetAllMocks()
  })

  it('is no-op if config values are not set', () => {
    const { mockExecutionContext, mockKafkaContext } = getMockExecutionContext()

    const interceptor = new KafkaThrottler({}, service)
    interceptor.intercept(mockExecutionContext, mockHandler)

    expect(mockKafkaContext.getConsumer).not.toHaveBeenCalled()
    expect(mockKafkaContext.getTopic).not.toHaveBeenCalled()
    expect(mockKafkaContext.getPartition).not.toHaveBeenCalled()
    expect(mockKafkaContext.getMessage).not.toHaveBeenCalled()

    expect(service.increment).not.toHaveBeenCalled()
    expect(mockHandler.handle).toHaveBeenCalledTimes(1)
  })

  it('pauses consumer for duration returned by throttler service', () => {
    mockIncrement.mockReturnValue(50)
    const { mockExecutionContext, mockConsumer } = getMockExecutionContext()

    const interceptor = new KafkaThrottler({ maxMessages: 1, slidingWindowMs: 100 }, service)
    interceptor.intercept(mockExecutionContext, mockHandler)

    expect(mockConsumer.pause).toHaveBeenCalledTimes(1)
    expect(mockConsumer.pause).toHaveBeenCalledWith([{ topic: 'test-topic', partitions: [1] }])

    expect(jest.getTimerCount()).toBe(1)
    jest.advanceTimersByTime(101)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('resumes consumer after the duration returned by the throttler service', () => {
    mockIncrement.mockReturnValue(50)
    const { mockExecutionContext, mockConsumer } = getMockExecutionContext(
      'test-topic',
      1,
      '0',
      [{ topic: 'test-topic', partitions: [1] }]
    )

    const interceptor = new KafkaThrottler({ maxMessages: 1, slidingWindowMs: 100 }, service)
    interceptor.intercept(mockExecutionContext, mockHandler)

    expect(mockConsumer.resume).not.toHaveBeenCalled()

    jest.advanceTimersByTime(101)

    expect(mockConsumer.resume).toHaveBeenCalledTimes(1)
    expect(mockConsumer.resume).toHaveBeenCalledWith([{ topic: 'test-topic', partitions: [1] }])
  })

  it('when pausing, seeks consumer to the current offset to ensure message will be re-processed', () => {
    mockIncrement.mockReturnValue(50)
    const { mockExecutionContext, mockConsumer } = getMockExecutionContext(
      'test-topic',
      1,
      '22',
      [{ topic: 'test-topic', partitions: [1] }]
    )

    const interceptor = new KafkaThrottler({ maxMessages: 1, slidingWindowMs: 100 }, service)
    interceptor.intercept(mockExecutionContext, mockHandler)

    expect(mockConsumer.seek).toHaveBeenCalledWith({offset: '22', partition: 1, topic: 'test-topic'})
  })

  it('does not call handler if throttled', () => {
    mockIncrement.mockReturnValue(50)
    const { mockExecutionContext } = getMockExecutionContext()

    const interceptor = new KafkaThrottler({ maxMessages: 1, slidingWindowMs: 100 }, service)
    interceptor.intercept(mockExecutionContext, mockHandler)

    expect(mockHandler.handle).not.toHaveBeenCalled()
  })

  it('does call handler if not throttled', () => {
    mockIncrement.mockReturnValue(null)
    const { mockExecutionContext } = getMockExecutionContext()

    const interceptor = new KafkaThrottler({ maxMessages: 100, slidingWindowMs: 100 }, service)
    interceptor.intercept(mockExecutionContext, mockHandler)

    expect(mockHandler.handle).toHaveBeenCalledTimes(1)
  })

  it('does not interact with kafka consumer at all if not throttled', () => {
    mockIncrement.mockReturnValue(null)
    const { mockExecutionContext, mockConsumer } = getMockExecutionContext()

    const interceptor = new KafkaThrottler({ maxMessages: 100, slidingWindowMs: 100 }, service)
    interceptor.intercept(mockExecutionContext, mockHandler)

    expect(mockConsumer.seek).not.toHaveBeenCalled()
    expect(mockConsumer.pause).not.toHaveBeenCalled()
    expect(mockConsumer.paused).not.toHaveBeenCalled()
    expect(mockConsumer.resume).not.toHaveBeenCalled()
  })
})