import { NestFactory } from '@nestjs/core'
import { Transport, MicroserviceOptions } from '@nestjs/microservices'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: ['kafka:9092'],
      },
      subscribe: {
        fromBeginning: true
      }
    }
  })

  await app.startAllMicroservices()
  await app.listen(3000)
  console.log('>> App started on port 3000')
}
bootstrap()
