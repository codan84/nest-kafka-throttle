import { Kafka } from 'kafkajs'
import { ulid } from 'ulid'

let timerId = null
let count = 0
const max = 1000
const delay = 500

const sendEvent = async (producer) => {
  console.log('>>> Producer sending event...')
  await producer.send({
    topic: 'my_event',
    messages: [
      {
        key: ulid(),
        value: JSON.stringify({
          publishedTimestamp: Date.now()
        })
      }
    ]
  })
  count++
  console.log('     ...done')

  if (timerId && count >= max) {
    console.log('>> Max events published')
    clearInterval(timerId)
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
