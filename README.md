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

### with-pausing-consumer

When we pause/resume consumer in the throttler guard, we can reduce the number of consumer crashing/restarting. However, this still happens 5th time we throw `KafkaRetriableException` (we replaced `RpcException` with that).
```
consumer-1    | [Nest] 1  - 11/08/2024, 11:24:13 PM     LOG [ServerKafka] INFO [ConsumerGroup] Resuming fetching from 1 topics {"timestamp":"2024-11-08T23:24:13.338Z","logger":"kafkajs","topicPartitions":[{"topic":"my_event","partitions":[0]}]}
consumer-1    | >>> Got message id=event-34-01JC71C1HTJ15XGEDK3WF5Y9ZQ
consumer-1    | >>> Got message id=event-35-01JC71C21F0G77A3XD46XD115B
consumer-1    | [Nest] 1  - 11/08/2024, 11:24:16 PM     LOG [ServerKafka] INFO [ConsumerGroup] Pausing fetching from 1 topics {"timestamp":"2024-11-08T23:24:16.108Z","logger":"kafkajs","topicPartitions":[{"topic":"my_event","partitions":[0]}]}
consumer-1    | [Nest] 1  - 11/08/2024, 11:24:16 PM   ERROR [ServerKafka] ERROR [Runner] Error when calling eachMessage {"timestamp":"2024-11-08T23:24:16.108Z","logger":"kafkajs","topic":"my_event","partition":0,"offset":"36","stack":"Error: Throttling limit reached on my_event:0\n    at RcpThrottlerGuard.handleRequest (/app/dist/app.controller.js:39:19)\n    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at async RcpThrottlerGuard.canActivate (/app/node_modules/@nestjs/throttler/dist/throttler.guard.js:86:28)\n    at async GuardsConsumer.tryActivate (/app/node_modules/@nestjs/core/guards/guards-consumer.js:16:17)\n    at async canActivateFn (/app/node_modules/@nestjs/microservices/context/rpc-context-creator.js:59:33)\n    at async /app/node_modules/@nestjs/microservices/context/rpc-context-creator.js:50:31\n    at async /app/node_modules/@nestjs/microservices/context/rpc-proxy.js:11:32\n    at async ServerKafka.handleEvent (/app/node_modules/@nestjs/microservices/server/server-kafka.js:198:32)\n    at async Runner.processEachMessage (/app/node_modules/kafkajs/src/consumer/runner.js:231:9)\n    at async onBatch (/app/node_modules/kafkajs/src/consumer/runner.js:447:9)","error":{"error":"Throttling limit reached on my_event:0","message":"Throttling limit reached on my_event:0"}}
consumer-1    | [Nest] 1  - 11/08/2024, 11:24:16 PM   ERROR [ServerKafka] ERROR [Consumer] Crash: KafkaJSNumberOfRetriesExceeded: Throttling limit reached on my_event:0 {"timestamp":"2024-11-08T23:24:16.111Z","logger":"kafkajs","groupId":"nestjs-group-server","retryCount":5,"stack":"KafkaJSNonRetriableError\n  Caused by: Error: Throttling limit reached on my_event:0\n    at RcpThrottlerGuard.handleRequest (/app/dist/app.controller.js:39:19)\n    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at async RcpThrottlerGuard.canActivate (/app/node_modules/@nestjs/throttler/dist/throttler.guard.js:86:28)\n    at async GuardsConsumer.tryActivate (/app/node_modules/@nestjs/core/guards/guards-consumer.js:16:17)\n    at async canActivateFn (/app/node_modules/@nestjs/microservices/context/rpc-context-creator.js:59:33)\n    at async /app/node_modules/@nestjs/microservices/context/rpc-context-creator.js:50:31\n    at async /app/node_modules/@nestjs/microservices/context/rpc-proxy.js:11:32\n    at async ServerKafka.handleEvent (/app/node_modules/@nestjs/microservices/server/server-kafka.js:198:32)\n    at async Runner.processEachMessage (/app/node_modules/kafkajs/src/consumer/runner.js:231:9)\n    at async onBatch (/app/node_modules/kafkajs/src/consumer/runner.js:447:9)"}
kafka-1       | [2024-11-08 23:24:16,111] INFO [GroupCoordinator 0]: Preparing to rebalance group nestjs-group-server in state PreparingRebalance with old generation 5 (__consumer_offsets-33) (reason: Removing member nestjs-consumer-server-33dc9374-e884-4bcc-9f57-838df1a60820 on LeaveGroup; client reason: not provided) (kafka.coordinator.group.GroupCoordinator)
kafka-1       | [2024-11-08 23:24:16,112] INFO [GroupCoordinator 0]: Group nestjs-group-server with generation 6 is now empty (__consumer_offsets-33) (kafka.coordinator.group.GroupCoordinator)
kafka-1       | [2024-11-08 23:24:16,113] INFO [GroupCoordinator 0]: Member MemberMetadata(memberId=nestjs-consumer-server-33dc9374-e884-4bcc-9f57-838df1a60820, groupInstanceId=None, clientId=nestjs-consumer-server, clientHost=/172.18.0.5, sessionTimeoutMs=30000, rebalanceTimeoutMs=60000, supportedProtocols=List(RoundRobinAssigner)) has left group nestjs-group-server through explicit `LeaveGroup`; client reason: not provided (kafka.coordinator.group.GroupCoordinator)
consumer-1    | [Nest] 1  - 11/08/2024, 11:24:16 PM     LOG [ServerKafka] INFO [Consumer] Stopped {"timestamp":"2024-11-08T23:24:16.113Z","logger":"kafkajs","groupId":"nestjs-group-server"}
consumer-1    | [Nest] 1  - 11/08/2024, 11:24:16 PM   ERROR [ServerKafka] ERROR [Consumer] Restarting the consumer in 14764ms {"timestamp":"2024-11-08T23:24:16.114Z","logger":"kafkajs","retryCount":5,"retryTime":14764,"groupId":"nestjs-group-server"}
```
