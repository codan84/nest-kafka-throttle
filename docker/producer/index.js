import { createWriteStream } from 'node:fs'
import { Kafka } from 'kafkajs'
import { ulid } from 'ulid'
import * as csv from 'fast-csv'

let timerId = null
let count = 0
const maxCount = 40
const delay = 1000

const file = createWriteStream('/app/outputs/producer.csv')
const csvStream = csv.format({ headers: true })
csvStream.pipe(file).on('end', () => file.close())

const sendEvent = async (producer) => {
  console.log(`>>> Producer sending event ${count}/${maxCount}...`)
  const now = Date.now()
  const id = `event-${count}-${ulid()}`
  await producer.send({
    topic: 'my_event',
    messages: [
      {
        key: id,
        value: JSON.stringify({
          publishedTimestamp: now
        })
      }
    ]
  })
  csvStream.write({ published: now, id})
  count++

  if (timerId && count >= maxCount) {
    console.log('>> Max events published')
    clearInterval(timerId)
    csvStream.end()
  }
}

const run = async () => {
  const kafka = new Kafka({
    clientId: 'kafka-event-producer',
    brokers: ['kafka:9092'],
    ssl: false
  })

  const producer = kafka.producer()
  await producer.connect()

  timerId = setInterval(async () => {
    await sendEvent(producer)
  }, delay)
}

run()
