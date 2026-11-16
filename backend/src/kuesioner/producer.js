// Producer Kafka: setiap respons form web dikirim ke topik respons kuisioner.
// Arsitektur: FORM -> Kafka Topic -> Kafka Consumer -> HDFS (raw data respon kuisioner).
import { Kafka, logLevel, Partitioners } from 'kafkajs';
import { config } from '../config.js';

export function createKafkaProducer(settings = config.kafka) {
  const kafka = new Kafka({
    clientId: settings.clientId,
    brokers: settings.brokers,
    connectionTimeout: settings.connectionTimeoutMs,
    requestTimeout: settings.requestTimeoutMs,
    retry: { initialRetryTime: 300, retries: 5 },
    logLevel: logLevel.WARN,
    logCreator: () => ({ level, log }) => {
      if (level <= logLevel.WARN) console.warn(`[kafka] ${log.message}`);
    },
  });
  // acks=all: pesan baru dianggap terkirim setelah tersimpan di broker. Duplikat
  // akibat retry producer disaring consumer berdasarkan id_respons (deduplikasi).
  const producer = kafka.producer({
    maxInFlightRequests: 1,
    allowAutoTopicCreation: false,
    createPartitioner: Partitioners.DefaultPartitioner,
  });
  let connecting = null;
  let connected = false;

  producer.on(producer.events.DISCONNECT, () => {
    connected = false;
  });

  async function ensureConnected() {
    if (connected) return;
    connecting ??= producer
      .connect()
      .then(() => {
        connected = true;
      })
      .finally(() => {
        connecting = null;
      });
    await connecting;
  }

  return {
    topic: settings.topic,
    async send({ key, value, headers = {} }) {
      // Batas waktu total agar responden tidak menunggu lama saat broker bermasalah.
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Kafka tidak merespons')), settings.requestTimeoutMs);
      });
      try {
        const kirim = (async () => {
          await ensureConnected();
          return producer.send({
            topic: settings.topic,
            acks: -1,
            timeout: settings.requestTimeoutMs,
            messages: [{ key, value: JSON.stringify(value), headers: { 'content-type': 'application/json', ...headers } }],
          });
        })();
        kirim.catch(() => {});
        const [meta] = await Promise.race([kirim, timeout]);
        return { partition: meta?.partition ?? null, offset: meta?.baseOffset ?? null };
      } finally {
        clearTimeout(timer);
      }
    },
    isConnected: () => connected,
    async close() {
      if (connected) await producer.disconnect();
    },
  };
}
