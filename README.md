# NestJs Throttler

Testing NestJs Throttler with Kafka microservice

## Links

- [nestjs kafka microservice](https://docs.nestjs.com/microservices/kafka)
- [nestjs guards for microservices](https://docs.nestjs.com/microservices/guards)
- [nestjs rate limiting](https://docs.nestjs.com/security/rate-limiting#rate-limiting)
- [nestjs guards](https://docs.nestjs.com/guards)

## Background

According to NestJs docs you can use any guard in a microservices app as-is, except you have to throw `RpcException`.  
On the other hand in the throttling section modifications to the guard have to be done to be used with Websockets or GQL.  
In theory we should only need to modify the exception the throttling guard throws?

## Setup

Docker-compose setup with few containers:
- kafka
- kafka-init (to create a topic)
- kafka UI (for convenience)
- consumer - NestJS app that will consume from the topic and simply print on the console
- producer - will mass-send events to a topic

## Running

If you make any cource-code changes:
```
npm run build:docker
```

To start docker-compose:
```
npm run start:docker
```

Keep in mind that due to the nature of NestJS beaing a heavy beast the consumer will start a little while after the producer.

## Output

2 CSV files will be written upon completion:
- `./outputs/producer.csv`
- `./outputs/consumer.csv`

Things to look out for:
- the same number of rows (each row representing either message published or message consumed)
- IDs in the same order
- publish/consume timestamps

## Branches

### main

No throttling, consumer processing as many messages as it can. Call this a `controll group`.

### with-builtin-throttler

Using built-in throttler without any modifications.  
We can already see issues here, as consumer logs errors every time it tries to consume a message:
```
consumer-1    | [Nest] 1  - 11/08/2024, 1:34:35 PM   ERROR [RpcExceptionsHandler] res.header is not a function
consumer-1    | TypeError: res.header is not a function
consumer-1    |     at ThrottlerGuard.handleRequest (/app/node_modules/@nestjs/throttler/dist/throttler.guard.js:118:17)
consumer-1    |     at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
consumer-1    |     at async ThrottlerGuard.canActivate (/app/node_modules/@nestjs/throttler/dist/throttler.guard.js:86:28)
consumer-1    |     at async GuardsConsumer.tryActivate (/app/node_modules/@nestjs/core/guards/guards-consumer.js:16:17)
consumer-1    |     at async canActivateFn (/app/node_modules/@nestjs/microservices/context/rpc-context-creator.js:59:33)
consumer-1    |     at async /app/node_modules/@nestjs/microservices/context/rpc-context-creator.js:50:31
consumer-1    |     at async /app/node_modules/@nestjs/microservices/context/rpc-proxy.js:11:32
consumer-1    |     at async ServerKafka.handleEvent (/app/node_modules/@nestjs/microservices/server/server-kafka.js:198:32)
consumer-1    |     at async Runner.processEachMessage (/app/node_modules/kafkajs/src/consumer/runner.js:231:9)
consumer-1    |     at async onBatch (/app/node_modules/kafkajs/src/consumer/runner.js:447:9)
consumer-1    | [Nest] 1  - 11/08/2024, 1:34:35 PM   ERROR [ServerKafka] ERROR [Runner] Error when calling eachMessage {"timestamp":"2024-11-08T13:34:35.083Z","logger":"kafkajs","topic":"my_event","partition":0,"offset":"889","error":{"status":"error","message":"Internal server error"}}
```

This suggests that we do not only have to modify the exception type thrown (as per NestJS docs [here](https://docs.nestjs.com/microservices/guards)), but also modify the `handleRequest` function of the throttler guard!

### with-rpc-exception

Extending built-in throttler guard to throw RpcException as described in docs [here](https://docs.nestjs.com/microservices/guards).  
We still see issues in `handleRequest`:
```
consumer-1    | [Nest] 1  - 11/08/2024, 4:05:00 PM   ERROR [RpcExceptionsHandler] res.header is not a function
consumer-1    | TypeError: res.header is not a function
consumer-1    |     at RcpThrottlerGuard.handleRequest (/app/node_modules/@nestjs/throttler/dist/throttler.guard.js:118:17)
consumer-1    |     at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
consumer-1    |     at async RcpThrottlerGuard.canActivate (/app/node_modules/@nestjs/throttler/dist/throttler.guard.js:86:28)
consumer-1    |     at async GuardsConsumer.tryActivate (/app/node_modules/@nestjs/core/guards/guards-consumer.js:16:17)
consumer-1    |     at async canActivateFn (/app/node_modules/@nestjs/microservices/context/rpc-context-creator.js:59:33)
consumer-1    |     at async /app/node_modules/@nestjs/microservices/context/rpc-context-creator.js:50:31
consumer-1    |     at async /app/node_modules/@nestjs/microservices/context/rpc-proxy.js:11:32
consumer-1    |     at async ServerKafka.handleEvent (/app/node_modules/@nestjs/microservices/server/server-kafka.js:198:32)
consumer-1    |     at async Runner.processEachMessage (/app/node_modules/kafkajs/src/consumer/runner.js:231:9)
consumer-1    |     at async onBatch (/app/node_modules/kafkajs/src/consumer/runner.js:447:9)
consumer-1    | [Nest] 1  - 11/08/2024, 4:05:00 PM   ERROR [ServerKafka] ERROR [Runner] Error when calling eachMessage {"timestamp":"2024-11-08T16:05:00.214Z","logger":"kafkajs","topic":"my_event","partition":0,"offset":"889","error":{"status":"error","message":"Internal server error"}}
```

### with-handle-request

Once we replace `handleRequest` with our own implementation things start working better, albeit not perfect.  
There are few issues here:
1. We are throwing `RpcException` and this creates a lot of noise upstream (see logs below)
2. Message delivery gets retried mutliple times and after a while consumer shuts itself down and restarts.

```
consumer-1    | >>> Got message id=event-37-01JC6TK3GHFVWZ5FY08RV1W5C2
consumer-1    | [Nest] 1  - 11/08/2024, 9:26:32 PM   ERROR [ServerKafka] ERROR [Runner] Error when calling eachMessage {"timestamp":"2024-11-08T21:26:32.573Z","logger":"kafkajs","topic":"my_event","partition":0,"offset":"38","error":{"status":"error","message":"ThrottlerException: Too Many Requests"}}
consumer-1    | [Nest] 1  - 11/08/2024, 9:26:32 PM   ERROR [ServerKafka] ERROR [Consumer] Crash: KafkaJSNumberOfRetriesExceeded: ThrottlerException: Too Many Requests {"timestamp":"2024-11-08T21:26:32.574Z","logger":"kafkajs","groupId":"nestjs-group-server","retryCount":5,"stack":"KafkaJSNonRetriableError\n  Caused by: undefined"}
consumer-1    | [Nest] 1  - 11/08/2024, 9:26:32 PM     LOG [ServerKafka] INFO [Consumer] Stopped {"timestamp":"2024-11-08T21:26:32.575Z","logger":"kafkajs","groupId":"nestjs-group-server"}
kafka-1       | [2024-11-08 21:26:32,574] INFO [GroupCoordinator 0]: Preparing to rebalance group nestjs-group-server in state PreparingRebalance with old generation 17 (__consumer_offsets-33) (reason: Removing member nestjs-consumer-server-5be76a95-08f9-4ef5-ad4e-f276cf4846e8 on LeaveGroup; client reason: not provided) (kafka.coordinator.group.GroupCoordinator)
consumer-1    | [Nest] 1  - 11/08/2024, 9:26:32 PM   ERROR [ServerKafka] ERROR [Consumer] Restarting the consumer in 10388ms {"timestamp":"2024-11-08T21:26:32.575Z","logger":"kafkajs","retryCount":5,"retryTime":10388,"groupId":"nestjs-group-server"}
kafka-1       | [2024-11-08 21:26:32,574] INFO [GroupCoordinator 0]: Group nestjs-group-server with generation 18 is now empty (__consumer_offsets-33) (kafka.coordinator.group.GroupCoordinator)
kafka-1       | [2024-11-08 21:26:32,574] INFO [GroupCoordinator 0]: Member MemberMetadata(memberId=nestjs-consumer-server-5be76a95-08f9-4ef5-ad4e-f276cf4846e8, groupInstanceId=None, clientId=nestjs-consumer-server, clientHost=/172.18.0.4, sessionTimeoutMs=30000, rebalanceTimeoutMs=60000, supportedProtocols=List(RoundRobinAssigner)) has left group nestjs-group-server through explicit `LeaveGroup`; client reason: not provided (kafka.coordinator.group.GroupCoordinator)
consumer-1    | [Nest] 1  - 11/08/2024, 9:26:42 PM     LOG [ServerKafka] INFO [Consumer] Starting {"timestamp":"2024-11-08T21:26:42.963Z","logger":"kafkajs","groupId":"nestjs-group-server"}
```

Thing to keep in mind is that standard throttler throttles Http requests per client (ie given clinet can make X requests in Y seconds).
We want to throttle only given topic, and thus we choose to use topic name as `tracker` when incrementing the request counter.
